/**
 * Finds and fixes products with broken img URLs:
 * - URL points to R2 key that doesn't exist
 * - URL-encoded Cyrillic filenames (check decoded key)
 * - img = just the folder path (no filename)
 * - Sets img to NULL for truly broken/unrecoverable refs
 */
import { S3Client, HeadObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { readFileSync, existsSync } from "fs";
import { readFile } from "fs/promises";
import { join, extname } from "path";
import { fileURLToPath } from "url";
import https from "https";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT    = join(__dirname, "..");
const REF_DIR = join(ROOT, "..", "reference", "www.zipper.in.ua-20260609_123-1", "img", "upload-files", "products");

const env = Object.fromEntries(
  readFileSync(join(ROOT, ".env"), "utf8").split("\n")
    .filter(l => l.trim() && !l.startsWith("#") && l.includes("="))
    .map(l => { const i = l.indexOf("="); return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^"|"$/g,"")]; })
);

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY },
});

const HOST   = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname;
const API    = env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = env.R2_BUCKET;
const R2_URL = env.NEXT_PUBLIC_R2_PUBLIC_URL;
const MIME   = { ".jpg":"image/jpeg",".jpeg":"image/jpeg",".png":"image/png",".webp":"image/webp",".gif":"image/gif" };

function supaReq(method, path, body, prefer) {
  return new Promise((resolve, reject) => {
    const buf = body ? Buffer.from(JSON.stringify(body), "utf8") : null;
    const req = https.request({
      hostname: HOST, port: 443, path: `/rest/v1/${path}`, method,
      headers: {
        Authorization: `Bearer ${API}`, apikey: API, Accept: "application/json",
        ...(buf ? { "Content-Type": "application/json", "Content-Length": buf.length } : {}),
        ...(prefer ? { Prefer: prefer } : {}),
      },
    }, res => {
      let d=""; res.on("data",c=>d+=c);
      res.on("end",()=>{
        if (res.statusCode >= 200 && res.statusCode < 300)
          try { resolve(JSON.parse(d)); } catch { resolve(null); }
        else reject(new Error(`${method} → HTTP ${res.statusCode}: ${d.slice(0,300)}`));
      });
    });
    req.on("error", reject);
    if (buf) req.write(buf);
    req.end();
  });
}

async function getAllPages(path) {
  const all = [];
  let offset = 0;
  while (true) {
    const rows = await supaReq("GET", `${path}&limit=1000&offset=${offset}`);
    if (!Array.isArray(rows) || !rows.length) break;
    all.push(...rows);
    if (rows.length < 1000) break;
    offset += 1000;
  }
  return all;
}

async function r2Exists(key) {
  try { await r2.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key })); return true; }
  catch { return false; }
}

function findLocal(filename) {
  const a = join(REF_DIR, filename); if (existsSync(a)) return a;
  const b = join(REF_DIR, "gallery", filename); if (existsSync(b)) return b;
  return null;
}

async function uploadToR2(key, filePath) {
  const buf  = await readFile(filePath);
  const mime = MIME[extname(filePath).toLowerCase()] ?? "image/webp";
  await r2.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: buf, ContentType: mime }));
  return `${R2_URL}/${key}`;
}

(async () => {
  console.log("=== Fixing broken img URLs ===\n");

  // --- Products ---
  console.log("Fetching all products with R2 img URLs...");
  const products = await getAllPages("products?select=id,lang,img&img=like.https*");
  console.log(`  Total: ${products.length}`);

  const broken = [];
  let checked = 0;
  for (const row of products) {
    checked++;
    if (checked % 500 === 0) process.stdout.write(`\r  Checking... ${checked}/${products.length}`);
    if (!row.img) continue;

    let url;
    try { url = new URL(row.img); } catch { broken.push({ ...row, reason: "invalid URL" }); continue; }

    const rawPath = url.pathname.slice(1);  // e.g. "products/IMG_xxx.webp" or "products/" or URL-encoded

    // Empty filename check (e.g. "products/" or "products")
    const filename = rawPath.split("/").pop();
    if (!filename) {
      broken.push({ ...row, filename: "", key: rawPath, reason: "empty filename" });
      continue;
    }

    // Try decoded key first (handles Cyrillic URL-encoded paths)
    const decodedKey = decodeURIComponent(rawPath);
    if (await r2Exists(decodedKey)) continue;  // Exists under decoded key → fine

    // Try encoded key
    if (await r2Exists(rawPath)) continue;  // Exists under encoded key → fine

    broken.push({ ...row, filename: decodeURIComponent(filename), key: decodedKey, reason: "missing in R2" });
  }
  process.stdout.write("\n");

  console.log(`\nBroken product imgs: ${broken.length}`);

  let fixed = 0, set_null = 0;
  for (const item of broken) {
    console.log(`  id=${item.id} lang=${item.lang} reason="${item.reason}" file="${item.filename}"`);
    const local = item.filename ? findLocal(item.filename) : null;

    if (local) {
      // Upload to R2
      const url = await uploadToR2(item.key, local);
      await supaReq("PATCH", `products?id=eq.${item.id}`, { img: url }, "return=minimal");
      console.log(`    -> Uploaded and updated`);
      fixed++;
    } else {
      // Can't find locally — set img to NULL so front-end shows placeholder
      await supaReq("PATCH", `products?id=eq.${item.id}`, { img: null }, "return=minimal");
      console.log(`    -> Set img to NULL (file not available)`);
      set_null++;
    }
  }

  // --- Products_photos ---
  console.log("\nFetching all products_photos with R2 img URLs...");
  const photos = await getAllPages("products_photos?select=id,pid,img&img=like.https*");
  console.log(`  Total: ${photos.length}`);

  const brokenPhotos = [];
  checked = 0;
  for (const row of photos) {
    checked++;
    if (checked % 1000 === 0) process.stdout.write(`\r  Checking... ${checked}/${photos.length}`);
    if (!row.img) continue;
    let url; try { url = new URL(row.img); } catch { brokenPhotos.push(row); continue; }
    const rawPath = url.pathname.slice(1);
    const filename = rawPath.split("/").pop();
    if (!filename) { brokenPhotos.push({ ...row, filename: "", key: rawPath }); continue; }
    const decodedKey = decodeURIComponent(rawPath);
    if (await r2Exists(decodedKey)) continue;
    if (await r2Exists(rawPath)) continue;
    brokenPhotos.push({ ...row, filename: decodeURIComponent(filename), key: decodedKey });
  }
  process.stdout.write("\n");
  console.log(`Broken photo imgs: ${brokenPhotos.length}`);

  let photoFixed = 0, photoNull = 0;
  for (const item of brokenPhotos.slice(0, 50)) {
    console.log(`  photo id=${item.id} pid=${item.pid} file="${item.filename}"`);
    const local = item.filename ? findLocal(item.filename) : null;
    if (local) {
      const url = await uploadToR2(item.key, local);
      await supaReq("PATCH", `products_photos?id=eq.${item.id}`, { img: url }, "return=minimal");
      photoFixed++;
    } else {
      await supaReq("PATCH", `products_photos?id=eq.${item.id}`, { img: null }, "return=minimal");
      photoNull++;
    }
  }

  console.log("\n=== SUMMARY ===");
  console.log(`Products:       ${fixed} uploaded, ${set_null} set null`);
  console.log(`Photos:         ${photoFixed} uploaded, ${photoNull} set null`);
  console.log(`Total broken:   ${broken.length + brokenPhotos.length}`);
})().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
