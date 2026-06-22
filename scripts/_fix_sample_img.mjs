/**
 * Fixes any products whose img points to an R2 URL that doesn't actually exist.
 * Specifically handles IMG_sample.webp and similar placeholder filenames.
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

function supaGet(path) {
  return new Promise((resolve, reject) => {
    https.get({
      hostname: HOST, port: 443, path: `/rest/v1/${path}`,
      headers: { Authorization: `Bearer ${API}`, apikey: API, Accept: "application/json" },
    }, res => { let d=""; res.on("data",c=>d+=c); res.on("end",()=>resolve(JSON.parse(d))); }).on("error", reject);
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

(async () => {
  console.log("Checking for R2 URLs that don't actually exist in R2...");

  // Get ALL products with R2 URLs (sample up to 1000, but limit to new ones)
  const rows = await supaGet("products?select=id,lang,img&img=like.https*&limit=1000");
  console.log(`  Checking ${rows.length} products...`);

  const missing = [];
  for (const row of rows) {
    if (!row.img) continue;
    const key = new URL(row.img).pathname.slice(1);
    const exists = await r2Exists(key);
    if (!exists) {
      missing.push({ id: row.id, lang: row.lang, img: row.img, key });
    }
  }

  console.log(`  Products with img URLs missing from R2: ${missing.length}`);
  if (missing.length === 0) {
    console.log("  All good! No broken R2 URLs.");
    return;
  }

  for (const m of missing) {
    console.log(`  MISSING: id=${m.id} lang=${m.lang} key=${m.key}`);
    const filename = m.key.split("/").pop();
    const local = findLocal(filename);
    if (local) {
      console.log(`    Found locally: ${local}`);
      const buf  = await readFile(local);
      const mime = MIME[extname(local).toLowerCase()] ?? "image/webp";
      await r2.send(new PutObjectCommand({ Bucket: BUCKET, Key: m.key, Body: buf, ContentType: mime }));
      console.log(`    Uploaded to R2: ${m.key}`);
    } else {
      console.log(`    NOT found locally: ${filename} — cannot upload`);
    }
  }

  // Also check products_photos
  console.log("\nChecking products_photos...");
  const photoRows = await supaGet("products_photos?select=id,pid,img&img=like.https*&limit=1000");
  const photoMissing = [];
  for (const row of photoRows) {
    if (!row.img) continue;
    const key = new URL(row.img).pathname.slice(1);
    const exists = await r2Exists(key);
    if (!exists) photoMissing.push({ ...row, key });
  }
  console.log(`  Photos with img URLs missing from R2: ${photoMissing.length}`);
  for (const m of photoMissing.slice(0, 10)) {
    console.log(`  MISSING: id=${m.id} pid=${m.pid} key=${m.key}`);
  }

  console.log("\nDone.");
})().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
