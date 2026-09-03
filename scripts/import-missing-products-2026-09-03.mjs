/**
 * One-time sync of products genuinely missing from Supabase as of 2026-09-03
 * (full-catalog diff: 9724 rows in the live legacy MySQL vs 9680 in Supabase —
 * 55 missing, mostly newer additions: id 10172-10341, plus a handful of older
 * orphaned ids). Confirmed against the live MySQL DB directly, not the stale
 * June dump scripts/import-all-missing-products.js used.
 *
 * INSERT-ONLY, by explicit instruction — never touches a row whose id already
 * exists in Supabase. Preserves the exact MySQL id/translationId as the
 * Supabase id/translation_id (same convention as import-all-missing-products.js)
 * so ru/uk pairing and any future re-diff stays correct.
 *
 * Image convention (reverse-engineered from a real, already-correct product
 * — id 6730 — and confirmed against reference/.../product.php's own comments,
 * which is the actual source of truth for what the live storefront reads):
 *   products.img       (small/card thumb)  -> R2 products/{filename}
 *     source: https://zipper.in.ua/img/upload-files/products/thumbs/{filename}
 *   products.img_full  (large/full-res)    -> R2 products/full/{filename}
 *     source: https://zipper.in.ua/img/upload-files/products/{filename}
 *   products_photos.img (gallery, ALREADY the large version)
 *                                           -> R2 products/gallery/{filename}
 *     source: https://zipper.in.ua/img/upload-files/products/gallery/{filename}
 *   gallery thumb (not a DB column at all — product.php derives it by
 *   string-replacing /gallery/ -> /gallery/thumbs/ in products_photos.img at
 *   render time, so the FILE must exist in R2 even though nothing references
 *   its URL directly)                      -> R2 products/gallery/thumbs/{filename}
 *     source: https://zipper.in.ua/img/upload-files/products/gallery/thumbs/{filename}
 *
 * products_photos.img_full is confirmed always NULL across the entire
 * existing catalog (0/9680) — deliberately left null here too, matching that.
 *
 * Run: node scripts/import-missing-products-2026-09-03.mjs
 */

import mysql from "mysql2/promise";
import { S3Client, PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { readFileSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT = join(__dirname, "..");

const env = Object.fromEntries(
  readFileSync(join(ROOT, ".env"), "utf8").split("\n")
    .filter((l) => l.trim() && !l.startsWith("#") && l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")]; })
);

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const R2_PUBLIC_URL = env.NEXT_PUBLIC_R2_PUBLIC_URL;
const LEGACY_BASE = "https://zipper.in.ua/img/upload-files/products";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY },
});

async function supaFetch(path, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json", ...(opts.headers || {}) },
  });
  if (!res.ok) throw new Error(`${opts.method ?? "GET"} ${path} -> HTTP ${res.status}: ${(await res.text()).slice(0, 500)}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function existsInR2(key) {
  try { await r2.send(new HeadObjectCommand({ Bucket: env.R2_BUCKET, Key: key })); return true; }
  catch { return false; }
}

async function fetchAndUpload(sourceUrl, r2Key) {
  if (await existsInR2(r2Key)) return `${R2_PUBLIC_URL}/${r2Key}`;
  const res = await fetch(sourceUrl);
  if (!res.ok) return null; // caller decides how to handle a missing source
  const buf = Buffer.from(await res.arrayBuffer());
  await r2.send(new PutObjectCommand({
    Bucket: env.R2_BUCKET, Key: r2Key, Body: buf,
    ContentType: res.headers.get("content-type") || "image/webp",
  }));
  return `${R2_PUBLIC_URL}/${r2Key}`;
}

async function main() {
  console.log("=== Connecting to live legacy MySQL ===");
  const my = await mysql.createConnection({
    host: "mozar24.mysql.tools", database: "mozar24_zipper", user: "mozar24_zipper",
    password: "IUfdy#%&@tewWu2342", connectTimeout: 15000, charset: "utf8mb4",
  });

  const [myIdRows] = await my.query("SELECT id FROM products");
  const myIds = myIdRows.map((r) => r.id);

  console.log("=== Diffing against Supabase (full catalog) ===");
  let pgIds = new Set();
  for (let offset = 0; ; offset += 1000) {
    const rows = await supaFetch(`products?select=id&order=id.asc&limit=1000&offset=${offset}`);
    if (!rows.length) break;
    rows.forEach((r) => pgIds.add(r.id));
    if (rows.length < 1000) break;
  }
  const missingIds = myIds.filter((id) => !pgIds.has(id));
  console.log(`MySQL: ${myIds.length}  Supabase: ${pgIds.size}  Missing: ${missingIds.length}`);
  if (!missingIds.length) { console.log("Nothing to do."); await my.end(); return; }

  const [products] = await my.query(`SELECT * FROM products WHERE id IN (${missingIds.join(",")})`);
  const [photos] = await my.query(`SELECT * FROM products_photos WHERE pid IN (${missingIds.join(",")})`);
  const [categories] = await my.query(`SELECT * FROM products_categories WHERE pid IN (${missingIds.join(",")})`);
  console.log(`Rows to insert — products: ${products.length}  photos: ${photos.length}  categories: ${categories.length}`);
  await my.end();

  // ── Step 1: resolve every image (download from the live legacy site,
  // upload to R2 at all 4 tiers) BEFORE inserting anything — so the DB
  // insert always has real, final R2 URLs, never a bare filename left
  // dangling if this script is interrupted partway. ────────────────────
  console.log("\n=== Uploading images (main small/large + gallery large/thumb) ===");
  const mainUrl = new Map();   // filename -> { small, full }
  const galleryUrl = new Map(); // filename -> large url (thumb uploaded but not referenced by any DB column)
  const failures = [];

  const mainFilenames = [...new Set(products.map((p) => p.img).filter(Boolean))];
  for (const [i, f] of mainFilenames.entries()) {
    const small = await fetchAndUpload(`${LEGACY_BASE}/thumbs/${f}`, `products/${f}`);
    const full = await fetchAndUpload(`${LEGACY_BASE}/${f}`, `products/full/${f}`);
    if (!small) failures.push(`main small missing: ${f}`);
    mainUrl.set(f, { small, full }); // full may legitimately be null — img_full is nullable
    process.stdout.write(`\r  main [${i + 1}/${mainFilenames.length}] ${f}`);
    await sleep(120);
  }
  console.log();

  const galleryFilenames = [...new Set(photos.map((p) => p.img).filter(Boolean))];
  for (const [i, f] of galleryFilenames.entries()) {
    const large = await fetchAndUpload(`${LEGACY_BASE}/gallery/${f}`, `products/gallery/${f}`);
    const thumb = await fetchAndUpload(`${LEGACY_BASE}/gallery/thumbs/${f}`, `products/gallery/thumbs/${f}`);
    if (!large) failures.push(`gallery large missing: ${f}`);
    if (!thumb) failures.push(`gallery thumb missing: ${f}`);
    galleryUrl.set(f, large);
    process.stdout.write(`\r  gallery [${i + 1}/${galleryFilenames.length}] ${f}`);
    await sleep(120);
  }
  console.log();

  if (failures.length) {
    console.log(`\n⚠ ${failures.length} image(s) could not be fetched from the legacy site:`);
    failures.forEach((f) => console.log("  " + f));
  }

  // ── Step 2: insert products (plain INSERT, no upsert/merge — a conflict
  // here means the missing-id diff above was wrong, and should fail loudly
  // rather than silently touch an existing row). ──────────────────────────
  console.log("\n=== Inserting products ===");
  const productRows = products.map((p) => {
    const m = mainUrl.get(p.img) ?? {};
    return {
      id: p.id, translation_id: p.translationId, lang: p.lang, pid: p.pid, filter_id: p.filterId,
      pcode: p.pcode, uri: p.uri, img: m.small ?? p.img, img2: p.img2, title: p.title,
      main_title: p.main_title, heading: p.heading, package: p.package, price: p.price,
      price_sale: p.price_sale, price2n: p.price2n, price2: p.price2, price3n: p.price3n, price3: p.price3,
      label_action: p.labelAction, text: p.text, priority: p.priority, popular: p.popular,
      measure: p.measure, minquantity: p.minquantity, descr: p.descr, seo_title: p.seoTitle,
      seo_key: p.seoKey, seo_descr: p.seoDescr, active: p.active,
      img_full: m.full ?? null,
    };
  });
  await supaFetch("products", { method: "POST", body: JSON.stringify(productRows), headers: { Prefer: "return=minimal" } });
  console.log(`  ✓ ${productRows.length} products inserted`);

  console.log("\n=== Inserting products_categories ===");
  const catRows = categories.map((c) => ({ id: c.id, pid: c.pid, cid: c.cid }));
  if (catRows.length) {
    await supaFetch("products_categories", { method: "POST", body: JSON.stringify(catRows), headers: { Prefer: "return=minimal" } });
  }
  console.log(`  ✓ ${catRows.length} category links inserted`);

  console.log("\n=== Inserting products_photos ===");
  const photoRows = photos.map((p) => ({
    id: p.id, pid: p.pid, translation_id: p.translationId ?? null, lang: p.lang ?? "ru",
    img: galleryUrl.get(p.img) ?? p.img, title: p.title || null, priority: p.priority ?? 20,
    img_full: null,
  }));
  for (let i = 0; i < photoRows.length; i += 200) {
    await supaFetch("products_photos", { method: "POST", body: JSON.stringify(photoRows.slice(i, i + 200)), headers: { Prefer: "return=minimal" } });
  }
  console.log(`  ✓ ${photoRows.length} gallery photos inserted`);

  console.log("\n=== DONE ===");
  console.log(`Products: ${productRows.length}  Categories: ${catRows.length}  Photos: ${photoRows.length}`);
  if (failures.length) console.log(`Image fetch failures: ${failures.length} (see list above)`);
}

main().catch((e) => { console.error("\nFATAL:", e.message); process.exit(1); });
