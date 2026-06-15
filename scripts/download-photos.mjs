/**
 * Downloads all product photos from production (zipper.in.ua) to local CRM public directory.
 * Run with: node scripts/download-photos.mjs
 */
import mysql from "mysql2/promise";
import { createWriteStream, mkdirSync, existsSync, unlinkSync, statSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import https from "https";
import http from "http";
import { readFileSync } from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

const envFile = readFileSync(path.join(ROOT, ".env"), "utf8");
const dbUrlMatch = envFile.match(/DATABASE_URL="?([^"\n]+)"?/);
if (!dbUrlMatch) { console.error("DATABASE_URL not found in .env"); process.exit(1); }
const DATABASE_URL = dbUrlMatch[1];

const PROD_BASE = "https://zipper.in.ua/img/upload-files";
const LOCAL_BASE = path.join(ROOT, "public", "img", "upload-files");

const inProgress = new Set();

function downloadUrl(url, dest, redirectCount = 0) {
  return new Promise((resolve) => {
    if (redirectCount > 5) { resolve("too-many-redirects"); return; }
    let file;
    try {
      file = createWriteStream(dest);
    } catch {
      resolve("open-error");
      return;
    }
    const proto = url.startsWith("https") ? https : http;
    const req = proto.get(url, { headers: { "User-Agent": "Mozilla/5.0" } }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) {
        file.destroy();
        try { unlinkSync(dest); } catch {}
        const location = res.headers.location;
        if (!location) { resolve("no-location"); return; }
        const redirectUrl = location.startsWith("http") ? location : new URL(location, url).toString();
        downloadUrl(redirectUrl, dest, redirectCount + 1).then(resolve);
        return;
      }
      if (res.statusCode === 404) { file.destroy(); try { unlinkSync(dest); } catch {}; resolve("404"); return; }
      if (res.statusCode !== 200) { file.destroy(); try { unlinkSync(dest); } catch {}; resolve(`${res.statusCode}`); return; }
      res.pipe(file);
      file.on("finish", () => { file.close(); resolve("ok"); });
      file.on("error", () => { file.destroy(); try { unlinkSync(dest); } catch {}; resolve("write-error"); });
    });
    req.on("error", () => { file.destroy(); try { unlinkSync(dest); } catch {}; resolve("req-error"); });
    req.setTimeout(15000, () => { req.destroy(); resolve("timeout"); });
  });
}

async function download(url, dest) {
  if (inProgress.has(dest)) return "in-progress";
  // Skip files that already exist and have size > 0
  try {
    const st = statSync(dest);
    if (st.size > 0) return "skip";
    // 0-byte file (failed previous attempt) — delete and retry
    unlinkSync(dest);
  } catch {}

  inProgress.add(dest);
  try {
    return await downloadUrl(url, dest);
  } catch {
    return "error";
  } finally {
    inProgress.delete(dest);
  }
}

async function downloadBatch(items, prodDir, urlBase, label) {
  mkdirSync(prodDir, { recursive: true });
  console.log(`\nDownloading ${items.length} ${label}...`);
  let ok = 0, skip = 0, fail = 0;
  const CONCURRENCY = 5;
  for (let i = 0; i < items.length; i += CONCURRENCY) {
    const chunk = items.slice(i, i + CONCURRENCY);
    const results = await Promise.all(chunk.map(row =>
      download(`${urlBase}/${row.img}`, path.join(prodDir, row.img))
    ));
    for (const status of results) {
      if (status === "ok") ok++;
      else if (status === "skip") skip++;
      else fail++;
    }
    const done = Math.min(i + CONCURRENCY, items.length);
    if (done % 500 === 0 || done === items.length) {
      process.stdout.write(`\r  ${done}/${items.length} ok:${ok} skip:${skip} fail:${fail}   `);
    }
  }
  console.log(`\n  done: ${ok} downloaded, ${skip} skipped (exist), ${fail} failed/missing`);
}

async function query(sql) {
  const conn = await mysql.createConnection(DATABASE_URL);
  const [rows] = await conn.execute(sql);
  await conn.end();
  return rows;
}

async function main() {
  console.log("Fetching photo lists from DB...");

  const photos = await query("SELECT DISTINCT img FROM products_photos WHERE img IS NOT NULL AND img != ''");
  await downloadBatch(photos, path.join(LOCAL_BASE, "products"), `${PROD_BASE}/products`, "product photos (gallery 1)");

  const photos2 = await query("SELECT DISTINCT img FROM products_photos2 WHERE img IS NOT NULL AND img != ''");
  await downloadBatch(photos2, path.join(LOCAL_BASE, "products2"), `${PROD_BASE}/products2`, "product gallery photos (gallery 2)");

  const productImgs = await query("SELECT DISTINCT img FROM products WHERE img IS NOT NULL AND img != '' AND lang = 'uk'");
  await downloadBatch(productImgs, path.join(LOCAL_BASE, "products"), `${PROD_BASE}/products`, "main product images");

  const categoryImgs = await query("SELECT DISTINCT img FROM categories WHERE img IS NOT NULL AND img != ''");
  await downloadBatch(categoryImgs, path.join(LOCAL_BASE, "categories"), `${PROD_BASE}/categories`, "category images");

  const categoryImgs2 = await query("SELECT DISTINCT img2 as img FROM categories WHERE img2 IS NOT NULL AND img2 != ''");
  await downloadBatch(categoryImgs2, path.join(LOCAL_BASE, "categories"), `${PROD_BASE}/categories`, "category images (img2)");

  const serviceImgs = await query("SELECT DISTINCT img FROM services WHERE img IS NOT NULL AND img != ''");
  await downloadBatch(serviceImgs, path.join(LOCAL_BASE, "services"), `${PROD_BASE}/services`, "service images");

  const articleImgs = await query("SELECT DISTINCT img FROM articles WHERE img IS NOT NULL AND img != ''");
  await downloadBatch(articleImgs, path.join(LOCAL_BASE, "articles"), `${PROD_BASE}/articles`, "article images");

  const newsImgs = await query("SELECT DISTINCT img FROM news WHERE img IS NOT NULL AND img != ''");
  await downloadBatch(newsImgs, path.join(LOCAL_BASE, "news"), `${PROD_BASE}/news`, "news images");

  const sliderImgs = await query("SELECT DISTINCT img FROM slider WHERE img IS NOT NULL AND img != ''");
  await downloadBatch(sliderImgs, path.join(LOCAL_BASE, "slider"), `${PROD_BASE}/slider`, "slider images");

  const sliderImgs2 = await query("SELECT DISTINCT img2 as img FROM slider WHERE img2 IS NOT NULL AND img2 != ''");
  await downloadBatch(sliderImgs2, path.join(LOCAL_BASE, "slider"), `${PROD_BASE}/slider`, "slider images (img2)");

  console.log("\nAll done!");
}

main().catch(console.error);
