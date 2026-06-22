/**
 * Uploads ALL product images with bare filenames (not yet on R2) to Cloudflare R2,
 * then updates products.img, products.img2, and products_photos.img in Supabase.
 *
 * Source images:
 *   c:\avian-code\zipper\reference\...\products\        (main images)
 *   c:\avian-code\zipper\reference\...\products\gallery\ (gallery photos)
 *   Both go to R2 key: products/{filename}
 *
 * Run: node scripts/upload-all-missing-images.mjs
 */

import { S3Client, PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { readFileSync, existsSync } from "fs";
import { readFile, readdir } from "fs/promises";
import { join, extname } from "path";
import { fileURLToPath } from "url";
import https from "https";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT    = join(__dirname, "..");
const REF_DIR = join(ROOT, "..", "reference", "www.zipper.in.ua-20260609_123-1", "img", "upload-files", "products");

// ── Parse .env ───────────────────────────────────────────────────────────────
const env = Object.fromEntries(
  readFileSync(join(ROOT, ".env"), "utf8").split("\n")
    .filter(l => l.trim() && !l.startsWith("#") && l.includes("="))
    .map(l => { const i = l.indexOf("="); return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^"|"$/g,"")]; })
);

const R2_PUBLIC_URL = env.NEXT_PUBLIC_R2_PUBLIC_URL;
const R2_FOLDER     = "products";
const SUPABASE_URL  = env.NEXT_PUBLIC_SUPABASE_URL;
const API_KEY       = env.SUPABASE_SERVICE_ROLE_KEY;
const HOST          = new URL(SUPABASE_URL).hostname;
const BUCKET        = env.R2_BUCKET;

const r2 = new S3Client({
  region:   "auto",
  endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY },
});

const MIME = {
  ".jpg":"image/jpeg", ".jpeg":"image/jpeg", ".png":"image/png",
  ".webp":"image/webp", ".gif":"image/gif",
};

// ── Supabase REST helpers ─────────────────────────────────────────────────────
function supaGet(path) {
  return new Promise((resolve, reject) => {
    https.get({
      hostname: HOST, port: 443,
      path: `/rest/v1/${path}`,
      headers: { Authorization: `Bearer ${API_KEY}`, apikey: API_KEY, Accept: "application/json" },
    }, res => {
      let d = "";
      res.on("data", c => d += c);
      res.on("end", () => resolve(JSON.parse(d)));
    }).on("error", reject);
  });
}

function supaPatch(table, filter, update) {
  return new Promise((resolve, reject) => {
    const buf = Buffer.from(JSON.stringify(update), "utf8");
    const req = https.request({
      hostname: HOST, port: 443,
      path: `/rest/v1/${table}?${filter}`,
      method: "PATCH",
      headers: {
        "Content-Type":   "application/json",
        "Content-Length": buf.length,
        Authorization: `Bearer ${API_KEY}`,
        apikey: API_KEY,
        Prefer: "return=minimal",
      },
    }, res => {
      let d = ""; res.on("data", c => d += c);
      res.on("end", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve();
        else reject(new Error(`PATCH ${table} → HTTP ${res.statusCode}: ${d.slice(0, 300)}`));
      });
    });
    req.on("error", reject);
    req.write(buf); req.end();
  });
}

// ── R2 helpers ────────────────────────────────────────────────────────────────
async function existsInR2(key) {
  try { await r2.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key })); return true; }
  catch { return false; }
}

async function uploadToR2(key, filePath) {
  const buf  = await readFile(filePath);
  const mime = MIME[extname(filePath).toLowerCase()] ?? "image/webp";
  await r2.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: buf, ContentType: mime }));
  return `${R2_PUBLIC_URL}/${key}`;
}

function findLocal(filename) {
  const direct  = join(REF_DIR, filename);
  const gallery = join(REF_DIR, "gallery", filename);
  if (existsSync(direct))  return direct;
  if (existsSync(gallery)) return gallery;
  return null;
}

// ── Step 1: Collect all bare filenames from Supabase ─────────────────────────
async function collectAllBareFilenames() {
  console.log("Querying Supabase for records with bare img filenames...");
  const filenames = new Set();

  // Fetch products.img
  let offset = 0;
  while (true) {
    const rows = await supaGet(
      `products?select=img&img=not.is.null&img=not.like.http*&limit=1000&offset=${offset}`
    );
    if (!Array.isArray(rows) || !rows.length) break;
    for (const r of rows) if (r.img) filenames.add(r.img);
    if (rows.length < 1000) break;
    offset += 1000;
  }
  console.log(`  products.img:  ${filenames.size} unique bare filenames so far`);

  // Fetch products.img2
  const before = filenames.size;
  offset = 0;
  while (true) {
    const rows = await supaGet(
      `products?select=img2&img2=not.is.null&img2=not.like.http*&limit=1000&offset=${offset}`
    );
    if (!Array.isArray(rows) || !rows.length) break;
    for (const r of rows) if (r.img2) filenames.add(r.img2);
    if (rows.length < 1000) break;
    offset += 1000;
  }
  console.log(`  products.img2: +${filenames.size - before} unique`);

  // Fetch products_photos.img
  const before2 = filenames.size;
  offset = 0;
  while (true) {
    const rows = await supaGet(
      `products_photos?select=img&img=not.is.null&img=not.like.http*&limit=1000&offset=${offset}`
    );
    if (!Array.isArray(rows) || !rows.length) break;
    for (const r of rows) if (r.img) filenames.add(r.img);
    if (rows.length < 1000) break;
    offset += 1000;
  }
  console.log(`  products_photos.img: +${filenames.size - before2} unique`);
  console.log(`  Total unique filenames: ${filenames.size}`);

  return filenames;
}

// ── Step 2: Upload to R2 ──────────────────────────────────────────────────────
async function uploadAll(filenames) {
  const uploaded = new Map();  // filename → full URL
  let done = 0, skipped = 0, missing = [], failed = [];
  const total = filenames.size;

  console.log(`\nUploading ${total} unique images to R2...`);

  for (const filename of filenames) {
    const key      = `${R2_FOLDER}/${filename}`;
    const localPath = findLocal(filename);

    if (!localPath) {
      missing.push(filename);
      continue;
    }

    const inR2 = await existsInR2(key);
    const url  = `${R2_PUBLIC_URL}/${key}`;

    if (inR2) {
      uploaded.set(filename, url);
      skipped++;
    } else {
      try {
        await uploadToR2(key, localPath);
        uploaded.set(filename, url);
        done++;
        process.stdout.write(`\r  ↑ [${done + skipped}/${total}] uploaded=${done} skipped=${skipped}`);
      } catch (e) {
        console.error(`\n  ✗ ${filename}: ${e.message}`);
        failed.push(filename);
      }
    }
  }

  console.log(`\n  Uploaded: ${done}  |  Already in R2: ${skipped}  |  Not found locally: ${missing.length}  |  Failed: ${failed.length}`);
  if (missing.length) console.log(`  Not found locally (first 20): ${missing.slice(0, 20).join(", ")}`);
  if (failed.length) console.log(`  Failed: ${failed.join(", ")}`);

  return uploaded;
}

// ── Step 3: Update Supabase in batches by filename ───────────────────────────
async function updateDB(uploaded) {
  console.log("\nUpdating Supabase with R2 URLs...");

  // Build reverse map: filename → URL (for PATCH filter we update all rows with that img value)
  // We'll update each unique filename via PATCH with eq filter
  let totalUpdated = 0;
  const entries = [...uploaded.entries()];
  const CONCURRENT = 10;

  async function updateColumn(table, col) {
    let count = 0;
    for (let i = 0; i < entries.length; i += CONCURRENT) {
      const batch = entries.slice(i, i + CONCURRENT);
      await Promise.all(batch.map(async ([filename, url]) => {
        try {
          await supaPatch(table, `${col}=eq.${encodeURIComponent(filename)}`, { [col]: url });
          count++;
        } catch (e) {
          // ignore individual failures — some filenames may not appear in this table
        }
      }));
      process.stdout.write(`\r  ${table}.${col}: ${Math.min(i + CONCURRENT, entries.length)}/${entries.length}`);
    }
    console.log(`\r  ${table}.${col}: done (${count} queries sent)`);
    return count;
  }

  await updateColumn("products",        "img");
  await updateColumn("products",        "img2");
  await updateColumn("products_photos", "img");

  console.log("  DB update complete.");
}

// ── Main ──────────────────────────────────────────────────────────────────────
(async () => {
  console.log("=== upload-all-missing-images ===");
  console.log(`Bucket:     ${BUCKET}`);
  console.log(`Public URL: ${R2_PUBLIC_URL}`);
  console.log(`Source dir: ${REF_DIR}\n`);

  if (!existsSync(REF_DIR)) {
    console.error(`ERROR: Source directory not found:\n  ${REF_DIR}`);
    process.exit(1);
  }

  const filenames = await collectAllBareFilenames();
  if (!filenames.size) {
    console.log("\nNo bare filenames found — everything already has R2 URLs. Done!");
    return;
  }

  const uploaded = await uploadAll(filenames);
  await updateDB(uploaded);

  console.log("\n=== DONE ===");
})().catch(err => { console.error("FATAL:", err.message); process.exit(1); });
