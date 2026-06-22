/**
 * Targeted fix for known broken img URL patterns:
 * 1. img ends with "/" (no filename) → set NULL
 * 2. img filename doesn't exist in R2 → try local upload, else NULL
 * 3. URL-encoded Cyrillic filenames → check decoded key in R2
 */
import { S3Client, HeadObjectCommand, PutObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
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

async function r2Exists(key) {
  try { await r2.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key })); return true; }
  catch { return false; }
}

function findLocal(filename) {
  const a = join(REF_DIR, filename); if (existsSync(a)) return a;
  const b = join(REF_DIR, "gallery", filename); if (existsSync(b)) return b;
  return null;
}

async function fixTable(table, idField, pidExtra = false) {
  const results = { fixed: 0, nulled: 0, already_ok: 0 };

  // Pattern 1: img ends with just "https://...r2.dev/products/" — empty filename
  const emptyFn = await supaReq("GET",
    `${table}?select=${idField},img&img=like.${encodeURIComponent(R2_URL + "/products/")}&limit=100`
  );
  console.log(`  Pattern 'empty filename': ${(emptyFn||[]).length} rows`);
  for (const row of emptyFn || []) {
    await supaReq("PATCH", `${table}?${idField}=eq.${row[idField]}`, { img: null }, "return=minimal");
    console.log(`    Nulled ${idField}=${row[idField]}`);
    results.nulled++;
  }

  // Pattern 2: img contains placeholder/sample name
  const sample = await supaReq("GET",
    `${table}?select=${idField},img&img=like.${encodeURIComponent(R2_URL + "/products/IMG_sample")}&limit=10`
  );
  console.log(`  Pattern 'IMG_sample': ${(sample||[]).length} rows`);
  for (const row of sample || []) {
    await supaReq("PATCH", `${table}?${idField}=eq.${row[idField]}`, { img: null }, "return=minimal");
    console.log(`    Nulled ${idField}=${row[idField]} (IMG_sample placeholder)`);
    results.nulled++;
  }

  // Pattern 3: img has URL-encoded chars (%) — check if decoded key exists
  const encoded = await supaReq("GET",
    `${table}?select=${idField},img&img=like.${encodeURIComponent(R2_URL + "/products/%")}&limit=50`
  );
  console.log(`  Pattern 'URL-encoded': ${(encoded||[]).length} rows`);
  for (const row of encoded || []) {
    const url = new URL(row.img);
    const rawPath = url.pathname.slice(1);
    const decodedPath = decodeURIComponent(rawPath);
    const filename = decodedPath.split("/").pop();

    // Check if decoded key exists
    if (await r2Exists(decodedPath)) {
      // Already exists under decoded key, the URL might differ — update to canonical URL
      const correctUrl = `${R2_URL}/${decodedPath}`;
      if (correctUrl !== row.img) {
        await supaReq("PATCH", `${table}?${idField}=eq.${row[idField]}`,
          { img: correctUrl }, "return=minimal");
        console.log(`    Fixed encoding: ${idField}=${row[idField]} -> ${correctUrl.slice(-40)}`);
        results.fixed++;
      } else {
        results.already_ok++;
      }
    } else if (await r2Exists(rawPath)) {
      console.log(`    Encoded key exists: ${idField}=${row[idField]} (OK)`);
      results.already_ok++;
    } else {
      // Not in R2 at all — try local
      const local = filename ? findLocal(filename) : null;
      if (local) {
        const buf  = await readFile(local);
        const mime = MIME[extname(local).toLowerCase()] ?? "image/webp";
        await r2.send(new PutObjectCommand({ Bucket: BUCKET, Key: decodedPath, Body: buf, ContentType: mime }));
        const newUrl = `${R2_URL}/${decodedPath}`;
        await supaReq("PATCH", `${table}?${idField}=eq.${row[idField]}`,
          { img: newUrl }, "return=minimal");
        console.log(`    Uploaded + fixed: ${idField}=${row[idField]} -> ${newUrl.slice(-40)}`);
        results.fixed++;
      } else {
        await supaReq("PATCH", `${table}?${idField}=eq.${row[idField]}`, { img: null }, "return=minimal");
        console.log(`    Nulled (not local): ${idField}=${row[idField]} ${filename}`);
        results.nulled++;
      }
    }
  }

  return results;
}

(async () => {
  console.log("=== Targeted fix for broken img patterns ===\n");

  console.log("Products table:");
  const prodResults = await fixTable("products", "id");
  console.log(`  fixed=${prodResults.fixed} nulled=${prodResults.nulled} ok=${prodResults.already_ok}`);

  console.log("\nProducts_photos table:");
  const photoResults = await fixTable("products_photos", "id");
  console.log(`  fixed=${photoResults.fixed} nulled=${photoResults.nulled} ok=${photoResults.already_ok}`);

  console.log("\n=== FINAL STATE CHECK ===");
  // Quick sanity check
  const nullProd  = await supaReq("GET", "products?select=id&img=is.null&limit=5");
  const bareProd  = await supaReq("GET", "products?select=id,img&img=not.like.https*&img=not.is.null&img=not.eq.&limit=5");
  const nullPhoto = await supaReq("GET", "products_photos?select=id&img=is.null&limit=1");
  const barePhoto = await supaReq("GET", "products_photos?select=id&img=not.like.https*&img=not.is.null&img=not.eq.&limit=1");

  console.log(`  Products with NULL img: ${(nullProd||[]).length} (sample)`);
  console.log(`  Products with bare img: ${(bareProd||[]).length}`);
  console.log(`  Photos with NULL img: ${(nullPhoto||[]).length} (sample)`);
  console.log(`  Photos with bare img: ${(barePhoto||[]).length}`);

  if (bareProd?.length) {
    console.log("  Remaining bare imgs:", bareProd.map(r => `id=${r.id} ${r.img}`));
  }

  console.log("\nDone.");
})().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
