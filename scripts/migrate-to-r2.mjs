// node scripts/migrate-to-r2.mjs
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, readdirSync, statSync } from "fs";
import { readFile } from "fs/promises";
import { join, extname, relative } from "path";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT = join(__dirname, "..");

// ── Parse .env ────────────────────────────────────────────────────
const envRaw = readFileSync(join(ROOT, ".env"), "utf8");
const env = Object.fromEntries(
  envRaw.split("\n")
    .filter(l => l.trim() && !l.startsWith("#") && l.includes("="))
    .map(l => {
      const idx = l.indexOf("=");
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim().replace(/^"|"$/g, "")];
    })
);

const R2_ACCOUNT_ID   = env.R2_ACCOUNT_ID;
const R2_BUCKET       = env.R2_BUCKET;
const R2_KEY_ID       = env.R2_ACCESS_KEY_ID;
const R2_SECRET       = env.R2_SECRET_ACCESS_KEY;
const R2_PUBLIC_URL   = env.NEXT_PUBLIC_R2_PUBLIC_URL;
const SUPABASE_URL    = env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY    = env.SUPABASE_SERVICE_ROLE_KEY;

if (!R2_KEY_ID || !R2_SECRET || !R2_PUBLIC_URL) {
  console.error("❌ Missing R2 credentials in .env"); process.exit(1);
}

// ── Clients ───────────────────────────────────────────────────────
const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: R2_KEY_ID, secretAccessKey: R2_SECRET },
});

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
  realtime: { transport: class { constructor() {} } },
});

// ── MIME types ────────────────────────────────────────────────────
const MIME = {
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
  ".gif": "image/gif",  ".webp": "image/webp", ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
};

// ── Helpers ───────────────────────────────────────────────────────
function* walkFiles(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) yield* walkFiles(full);
    else yield full;
  }
}

async function runBatch(items, fn, concurrency = 15) {
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const item = items[i++];
      await fn(item).catch(e => console.error(`  ⚠ ${e.message}`));
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
}

// ── STEP 1: Upload all files to R2 ───────────────────────────────
async function uploadAll() {
  const baseDir = join(ROOT, "public", "img", "upload-files");
  const files = [...walkFiles(baseDir)];
  console.log(`\n📦 Uploading ${files.length} files to R2...\n`);

  let done = 0;
  await runBatch(files, async (filePath) => {
    const key = relative(baseDir, filePath).replace(/\\/g, "/");
    const ext = extname(filePath).toLowerCase();
    const buf = await readFile(filePath);
    await r2.send(new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: buf,
      ContentType: MIME[ext] || "application/octet-stream",
    }));
    done++;
    if (done % 500 === 0) process.stdout.write(`  ✓ ${done}/${files.length}\r`);
  });
  console.log(`\n✅ Uploaded ${done} files\n`);
}

// ── STEP 2: Update DB records ─────────────────────────────────────
// (table, column, r2_folder) — folder under upload-files/ where the file lives
const DB_MAPPINGS = [
  // products
  { table: "products",       col: "img",  folder: "products" },
  { table: "products_photos",col: "img",  folder: "products" },
  { table: "products_photos2",col:"img",  folder: "products" },
  // categories (folder may be empty but update anyway)
  { table: "categories",     col: "img",  folder: "categories" },
  { table: "categories",     col: "img2", folder: "categories" },
  // articles
  { table: "articles",       col: "img",  folder: "articles" },
  { table: "articles_photos",col: "img",  folder: "articles" },
  // news
  { table: "news",           col: "img",  folder: "news" },
  { table: "news_photos",    col: "img",  folder: "news" },
  // managers
  { table: "managers",       col: "img",  folder: "managers" },
  // slider
  { table: "slider",         col: "img",  folder: "slider" },
  { table: "slider",         col: "img2", folder: "slider" },
  // gallery
  { table: "gallery",        col: "img",  folder: "gallery" },
  // services
  { table: "services",       col: "img",  folder: "services" },
];

async function updateDB() {
  console.log("🗄  Updating database records...\n");
  let totalUpdated = 0;

  for (const { table, col, folder } of DB_MAPPINGS) {
    // Fetch rows where col is set but not already an http URL
    const { data: rows, error } = await supabase
      .from(table)
      .select(`id, ${col}`)
      .not(col, "is", null)
      .not(col, "like", "http%");

    if (error) { console.warn(`  ⚠ ${table}.${col}: ${error.message}`); continue; }
    if (!rows?.length) { console.log(`  – ${table}.${col}: already up to date`); continue; }

    console.log(`  ↑ ${table}.${col}: ${rows.length} rows → updating...`);

    // Batch update in groups of 50
    for (let i = 0; i < rows.length; i += 50) {
      const batch = rows.slice(i, i + 50);
      await Promise.all(batch.map(row =>
        supabase.from(table)
          .update({ [col]: `${R2_PUBLIC_URL}/${folder}/${row[col]}` })
          .eq("id", row.id)
      ));
    }
    totalUpdated += rows.length;
    console.log(`  ✓ ${table}.${col}: ${rows.length} updated`);
  }

  console.log(`\n✅ DB: ${totalUpdated} records updated\n`);
}

// ── Run ───────────────────────────────────────────────────────────
(async () => {
  console.log("🚀 R2 Migration\n");
  console.log(`  Bucket : ${R2_BUCKET}`);
  console.log(`  Public : ${R2_PUBLIC_URL}\n`);

  await uploadAll();
  await updateDB();

  console.log("🎉 Done! All images are now on R2.");
})();
