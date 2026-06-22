/**
 * Fast parallel image upload to R2 + immediate Supabase DB update.
 *
 * Processes products.img and products_photos.img fields that still have bare
 * filenames (not R2 URLs). Uploads 20 files concurrently.
 *
 * Run: node scripts/upload-images-fast.mjs
 * Resume: node scripts/upload-images-fast.mjs  (safe to re-run, skips files already in R2)
 */

import { S3Client, PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { readFileSync, existsSync } from "fs";
import { readFile } from "fs/promises";
import { join, extname } from "path";
import { fileURLToPath } from "url";
import https from "https";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT    = join(__dirname, "..");
const REF_DIR = join(ROOT, "..", "reference", "www.zipper.in.ua-20260609_123-1", "img", "upload-files", "products");

// ── Env ───────────────────────────────────────────────────────────────────────
const env = Object.fromEntries(
  readFileSync(join(ROOT, ".env"), "utf8").split("\n")
    .filter(l => l.trim() && !l.startsWith("#") && l.includes("="))
    .map(l => { const i = l.indexOf("="); return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^"|"$/g,"")]; })
);
const R2_PUBLIC_URL = env.NEXT_PUBLIC_R2_PUBLIC_URL;
const HOST  = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname;
const API   = env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = env.R2_BUCKET;
const CONCURRENCY = 20;
const R2_FOLDER = "products";

const MIME = {
  ".jpg":"image/jpeg",".jpeg":"image/jpeg",".png":"image/png",
  ".webp":"image/webp",".gif":"image/gif",".svg":"image/svg+xml",
};

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY },
});

// ── HTTP helpers ──────────────────────────────────────────────────────────────
function supaRequest(method, path, body, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const buf = body ? Buffer.from(JSON.stringify(body), "utf8") : null;
    const req = https.request({
      hostname: HOST, port: 443, path: `/rest/v1/${path}`, method,
      headers: {
        Authorization: `Bearer ${API}`, apikey: API, Accept: "application/json",
        ...(buf ? { "Content-Type": "application/json", "Content-Length": buf.length } : {}),
        ...extraHeaders,
      },
    }, res => {
      let d = ""; res.on("data", c => d += c);
      res.on("end", () => {
        if (res.statusCode >= 200 && res.statusCode < 300)
          try { resolve(JSON.parse(d)); } catch { resolve(null); }
        else reject(new Error(`${method} ${path} → HTTP ${res.statusCode}: ${d.slice(0,300)}`));
      });
    });
    req.on("error", reject);
    if (buf) req.write(buf);
    req.end();
  });
}

function supaGetAll(table, col) {
  // Fetches all rows where col is not null and not http* (bare filenames)
  return new Promise(async (resolve, reject) => {
    const all = new Set();
    let offset = 0;
    while (true) {
      try {
        const rows = await supaRequest(
          "GET",
          `${table}?select=${col}&${col}=not.is.null&${col}=not.like.http*&limit=1000&offset=${offset}`,
        );
        if (!Array.isArray(rows) || !rows.length) break;
        for (const r of rows) if (r[col]) all.add(r[col]);
        if (rows.length < 1000) break;
        offset += 1000;
      } catch (e) { return reject(e); }
    }
    resolve(all);
  });
}

async function patchByValue(table, col, filename, url) {
  try {
    await supaRequest(
      "PATCH",
      `${table}?${col}=eq.${encodeURIComponent(filename)}`,
      { [col]: url },
      { Prefer: "return=minimal" }
    );
    return true;
  } catch (e) {
    // Already updated or row gone — not fatal
    return false;
  }
}

// ── R2 helpers ────────────────────────────────────────────────────────────────
async function r2Exists(key) {
  try { await r2.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key })); return true; }
  catch { return false; }
}

async function r2Upload(key, filePath) {
  const buf  = await readFile(filePath);
  const mime = MIME[extname(filePath).toLowerCase()] ?? "application/octet-stream";
  await r2.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: buf, ContentType: mime }));
}

function findLocal(filename) {
  const a = join(REF_DIR, filename);
  if (existsSync(a)) return a;
  const b = join(REF_DIR, "gallery", filename);
  if (existsSync(b)) return b;
  return null;
}

// ── Progress ──────────────────────────────────────────────────────────────────
const stats = { uploaded: 0, alreadyR2: 0, dbUpdated: 0, notFound: 0, failed: [] };
let processed = 0;
let total = 0;

function printProgress() {
  process.stdout.write(
    `\r  [${processed}/${total}] uploaded=${stats.uploaded} inR2=${stats.alreadyR2} dbUpd=${stats.dbUpdated} missing=${stats.notFound} failed=${stats.failed.length}  `
  );
}

// ── Process one filename across all tables ─────────────────────────────────────
// tables: array of {table, col} entries that reference this filename
async function processFilename(filename, tables) {
  const key  = `${R2_FOLDER}/${filename}`;
  const url  = `${R2_PUBLIC_URL}/${key}`;
  let inR2   = false;

  const local = findLocal(filename);

  if (!local) {
    stats.notFound++;
    processed++;
    return;
  }

  // Upload if not already in R2
  inR2 = await r2Exists(key);
  if (!inR2) {
    try {
      await r2Upload(key, local);
      stats.uploaded++;
      inR2 = true;
    } catch (e) {
      stats.failed.push({ filename, error: e.message });
      processed++;
      printProgress();
      return;
    }
  } else {
    stats.alreadyR2++;
  }

  // Update DB for all tables referencing this filename
  if (inR2) {
    await Promise.all(tables.map(({ table, col }) =>
      patchByValue(table, col, filename, url).then(ok => { if (ok) stats.dbUpdated++; })
    ));
  }

  processed++;
  printProgress();
}

// ── Concurrency pool ──────────────────────────────────────────────────────────
async function runPool(tasks, concurrency) {
  const results = [];
  let idx = 0;
  async function worker() {
    while (idx < tasks.length) {
      const i = idx++;
      results[i] = await tasks[i]();
    }
  }
  const workers = Array.from({ length: concurrency }, worker);
  await Promise.all(workers);
  return results;
}

// ── Main ──────────────────────────────────────────────────────────────────────
(async () => {
  console.log("=== Fast parallel image upload ===");
  console.log(`R2 bucket:  ${BUCKET}`);
  console.log(`Public URL: ${R2_PUBLIC_URL}`);
  console.log(`Source:     ${REF_DIR}`);
  console.log(`Concurrency: ${CONCURRENCY}\n`);

  if (!existsSync(REF_DIR)) {
    console.error(`Source dir not found: ${REF_DIR}`); process.exit(1);
  }

  // Collect all bare filenames from Supabase, grouped by which table+col references them
  console.log("Querying Supabase for records with bare filenames...");
  const [prodImg, photosImg] = await Promise.all([
    supaGetAll("products",        "img"),
    supaGetAll("products_photos", "img"),
  ]);

  // Build map: filename → [{table, col}, ...]
  const fileMap = new Map();
  function addFile(filename, table, col) {
    if (!filename) return;
    if (!fileMap.has(filename)) fileMap.set(filename, []);
    // Only add if not already listed for this table+col
    const arr = fileMap.get(filename);
    if (!arr.find(e => e.table === table && e.col === col)) arr.push({ table, col });
  }
  for (const f of prodImg)   addFile(f, "products",        "img");
  for (const f of photosImg) addFile(f, "products_photos", "img");

  total = fileMap.size;
  console.log(`  products.img bare:        ${prodImg.size}`);
  console.log(`  products_photos.img bare: ${photosImg.size}`);
  console.log(`  Unique filenames to process: ${total}\n`);

  if (!total) {
    console.log("All images already have R2 URLs. Done!");
    return;
  }

  // Build task list
  const tasks = [...fileMap.entries()].map(([filename, tables]) =>
    () => processFilename(filename, tables)
  );

  console.log(`Processing ${total} unique images with ${CONCURRENCY} concurrent workers...\n`);
  printProgress();

  await runPool(tasks, CONCURRENCY);
  process.stdout.write("\n");

  // Final report
  console.log("\n=== DONE ===");
  console.log(`  Uploaded to R2:       ${stats.uploaded}`);
  console.log(`  Already in R2:        ${stats.alreadyR2}`);
  console.log(`  DB records updated:   ${stats.dbUpdated}`);
  console.log(`  Not found locally:    ${stats.notFound}`);
  console.log(`  Failed:               ${stats.failed.length}`);
  if (stats.failed.length) {
    console.log("\nFailed uploads:");
    for (const f of stats.failed.slice(0, 20)) console.log(`  ${f.filename}: ${f.error}`);
  }
  if (stats.notFound > 0) {
    console.log("\nNote: images not found locally cannot be uploaded.");
    console.log("Check the reference directory for missing files.");
  }
})().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
