/**
 * Uploads missing "Блискавки зі стразами" product images to Cloudflare R2,
 * then updates img fields in Supabase (products + products_photos).
 *
 * Sources:
 *   Main images:   reference/.../products/IMG_*.webp
 *   Gallery photos: reference/.../products/gallery/IMG_*.webp
 *   → both uploaded to R2 key: products/{filename}
 *
 * Run: node scripts/upload-straz-images.mjs
 */

import { S3Client, PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { readFile } from "fs/promises";
import { join, extname } from "path";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT      = join(__dirname, "..");
const REF_DIR   = join(ROOT, "..", "reference", "www.zipper.in.ua-20260609_123-1", "img", "upload-files", "products");

// ── Parse .env ────────────────────────────────────────────────────────────────
const env = Object.fromEntries(
  readFileSync(join(ROOT, ".env"), "utf8").split("\n")
    .filter(l => l.trim() && !l.startsWith("#") && l.includes("="))
    .map(l => { const i = l.indexOf("="); return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^"|"$/g,"")]; })
);

const R2_PUBLIC_URL = env.NEXT_PUBLIC_R2_PUBLIC_URL;  // https://pub-332d2905ae4f48b5878d35d9fdb63ef1.r2.dev
const R2_FOLDER     = "products";

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY },
});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
  realtime: { transport: class { constructor() {} } },
});

const MIME = {
  ".jpg":"image/jpeg", ".jpeg":"image/jpeg", ".png":"image/png",
  ".webp":"image/webp", ".gif":"image/gif",
};

// Product IDs that were just imported
const STRAZ_PIDS = new Set([
  748,749,750,751,752,753,754,755,756,757,758,
  759,760,761,762,763,764,765,766,767,768,769,
  770,771,772,773,774,775,776,2657,2658,
]);

// ── Helpers ───────────────────────────────────────────────────────────────────
async function existsInR2(key) {
  try {
    await r2.send(new HeadObjectCommand({ Bucket: env.R2_BUCKET, Key: key }));
    return true;
  } catch { return false; }
}

async function uploadToR2(key, filePath) {
  const buf  = await readFile(filePath);
  const mime = MIME[extname(filePath).toLowerCase()] ?? "image/webp";
  await r2.send(new PutObjectCommand({
    Bucket: env.R2_BUCKET, Key: key, Body: buf, ContentType: mime,
  }));
  return `${R2_PUBLIC_URL}/${key}`;
}

function findLocal(filename) {
  const direct  = join(REF_DIR, filename);
  const gallery = join(REF_DIR, "gallery", filename);
  if (existsSync(direct))  return direct;
  if (existsSync(gallery)) return gallery;
  return null;
}

// ── Step 1: Collect all filenames needed from Supabase ────────────────────────
async function collectFilenames() {
  const filenames = new Map(); // filename → Set of table rows needing update

  // products table — img field (for ru products with original ids)
  const { data: prods } = await supabase
    .from("products")
    .select("id, img")
    .in("id", [...STRAZ_PIDS])
    .not("img", "like", "http%")
    .not("img", "is", null);

  for (const p of prods ?? []) {
    if (p.img) filenames.set(p.img, (filenames.get(p.img) ?? 0) + 1);
  }

  // Also get uk products (auto-generated ids) that still have bare filenames
  const { data: ukProds } = await supabase
    .from("products")
    .select("id, img, translation_id")
    .in("translation_id", [...STRAZ_PIDS])
    .eq("lang", "uk")
    .not("img", "like", "http%")
    .not("img", "is", null);

  for (const p of ukProds ?? []) {
    if (p.img) filenames.set(p.img, (filenames.get(p.img) ?? 0) + 1);
  }

  // products_photos — img field
  const { data: photos } = await supabase
    .from("products_photos")
    .select("id, img, pid")
    .not("img", "like", "http%")
    .not("img", "is", null);

  // Filter to only our straz products (by pid directly or by uk-translated products)
  const allUkIds = new Set((ukProds ?? []).map(p => p.id));
  for (const ph of photos ?? []) {
    if (STRAZ_PIDS.has(ph.pid) || allUkIds.has(ph.pid)) {
      if (ph.img) filenames.set(ph.img, (filenames.get(ph.img) ?? 0) + 1);
    }
  }

  return filenames;
}

// ── Step 2: Upload files to R2 ────────────────────────────────────────────────
async function uploadImages(filenames) {
  const uploaded = new Map(); // filename → full R2 URL
  let skipped = 0, done = 0, failed = [];

  console.log(`\nUploading ${filenames.size} unique images to R2...`);

  for (const filename of filenames.keys()) {
    const key      = `${R2_FOLDER}/${filename}`;
    const localPath = findLocal(filename);

    if (!localPath) {
      console.warn(`  ⚠ Not found locally: ${filename}`);
      failed.push(filename);
      continue;
    }

    // Skip if already in R2
    if (await existsInR2(key)) {
      const url = `${R2_PUBLIC_URL}/${key}`;
      uploaded.set(filename, url);
      skipped++;
      continue;
    }

    try {
      const url = await uploadToR2(key, localPath);
      uploaded.set(filename, url);
      done++;
      process.stdout.write(`  ↑ [${done + skipped}/${filenames.size}] ${filename}\r`);
    } catch (e) {
      console.error(`  ✗ ${filename}: ${e.message}`);
      failed.push(filename);
    }
  }

  console.log(`\n  Uploaded: ${done}  |  Already in R2: ${skipped}  |  Failed: ${failed.length}`);
  if (failed.length) console.warn("  Failed:", failed);

  return uploaded;
}

// ── Step 3: Update Supabase with full R2 URLs ──────────────────────────────────
async function updateDB(uploaded) {
  console.log("\nUpdating Supabase records...");
  let total = 0;

  // Helper — update in batches by filename
  async function updateTable(table, col, idField = "id") {
    const { data: rows } = await supabase
      .from(table)
      .select(`${idField}, ${col}`)
      .not(col, "like", "http%")
      .not(col, "is", null);

    const toUpdate = (rows ?? []).filter(r => uploaded.has(r[col]));
    if (!toUpdate.length) return;

    for (let i = 0; i < toUpdate.length; i += 50) {
      const batch = toUpdate.slice(i, i + 50);
      await Promise.all(batch.map(row =>
        supabase.from(table).update({ [col]: uploaded.get(row[col]) }).eq(idField, row[idField])
      ));
    }
    console.log(`  ✓ ${table}.${col}: ${toUpdate.length} rows updated`);
    total += toUpdate.length;
  }

  await updateTable("products",       "img");
  await updateTable("products",       "img2");
  await updateTable("products_photos","img");

  console.log(`  Total updated: ${total} rows`);
}

// ── Main ──────────────────────────────────────────────────────────────────────
(async () => {
  console.log("R2 Upload — Блискавки зі стразами");
  console.log(`Bucket:     ${env.R2_BUCKET}`);
  console.log(`Public URL: ${R2_PUBLIC_URL}`);
  console.log(`Source dir: ${REF_DIR}\n`);

  const filenames = await collectFilenames();
  console.log(`Images needed: ${filenames.size}`);

  const uploaded = await uploadImages(filenames);
  await updateDB(uploaded);

  console.log("\nDone!");
})().catch(err => { console.error("FATAL:", err.message); process.exit(1); });
