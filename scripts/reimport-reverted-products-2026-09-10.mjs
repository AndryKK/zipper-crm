/**
 * Re-import of the products that revert-extra-missing-products-2026-09-03.mjs
 * deleted.
 *
 * BACKGROUND. On 2026-09-03 import-missing-products-2026-09-03.mjs did a full
 * catalog diff (live legacy MySQL vs Supabase), found 55 products missing and
 * imported all 55. The user then wanted only the ~18 shown in a screenshot, so
 * revert-extra-missing-products-2026-09-03.mjs deleted the other 37 rows by a
 * hard-coded id list (DELETE_IDS). That revert went too far: several of those
 * rows are products that are active on the storefront and/or already have real
 * order history in Supabase (131 orders_item rows across 125 orders point at a
 * now-missing product), and it left 8 translation groups as uk-only
 * half-products.
 *
 * WHAT THIS DOES. Re-inserts exactly the rows that are genuinely absent now —
 * recomputed here as a live diff, NOT trusted from a list — and asserts that
 * set is a subset of the 2026-09-03 DELETE_IDS. Then inserts the matching
 * products_categories and products_photos.
 *
 * IDENTITY = (translation_id, lang), NOT (pcode, lang). pcode is not unique in
 * this catalog — e.g. `T10261` is shared by translation groups 1517 (a Type-8
 * angled-tooth zip) and 10261 (a Type-7 tractor zip colour). An earlier draft
 * keyed the diff on (pcode, lang) and so wrongly considered id 10261 "already
 * present" because group 1517's ru/T10261 row exists. Same trap the
 * project_availability_sync notes call out for k10081 / T10261 / bt10136.
 *
 * IMAGES. Every image these products need is ALREADY in R2 — the 2026-09-03
 * run uploaded all of them and the revert only ever touched DB rows, never R2
 * objects (verified: all 23 main images small+full, all 157 gallery
 * images+thumbs present). The legacy image host now 410s, so this script does
 * NOT fetch anything — it builds the R2 URL and HEAD-checks it, falling back to
 * a bare filename only if the object is somehow gone.
 *
 * SAFETY. INSERT-only, ~35 product rows + ~100 category rows + ~300 photo rows
 * — orders of magnitude below any trigger-storm threshold (and `products` has
 * no triggers anyway — see project_availability_sync). A plain INSERT that
 * conflicts fails loudly rather than touching an existing row.
 *
 * Run: node scripts/reimport-reverted-products-2026-09-10.mjs [--dry]
 */

import mysql from "mysql2/promise";
import { S3Client, HeadObjectCommand } from "@aws-sdk/client-s3";
import { readFileSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";

const DRY = process.argv.includes("--dry");
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

// The 2026-09-03 revert's own DELETE_IDS, verbatim — used only as an assertion
// that this script's independently-recomputed "missing now" set is exactly
// that revert and nothing else.
const REVERT_DELETE_IDS = new Set([
  398, 3764, 489, 3850, 8909, 8910, 9220, 9221, 9273, 9275,
  10172, 10173, 10181, 10182, 10183,
  10254, 10269, 10255, 10268, 10256, 10267, 10257, 10266, 10258, 10265, 10259, 10264, 10260, 10263, 10261,
  10270, 10271, 10272, 10273, 10274, 10275, 10281,
]);

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

async function supaAll(selectPath) {
  let out = [], offset = 0;
  for (;;) {
    const rows = await supaFetch(`${selectPath}&limit=1000&offset=${offset}`);
    out.push(...rows);
    if (rows.length < 1000) break;
    offset += 1000;
  }
  return out;
}

async function r2Has(key) {
  try { await r2.send(new HeadObjectCommand({ Bucket: env.R2_BUCKET, Key: key })); return true; }
  catch { return false; }
}

const norm = (s) => String(s ?? "").trim().toLowerCase();

async function main() {
  console.log(`=== Connecting to live legacy MySQL ===${DRY ? "   (DRY RUN)" : ""}`);
  const my = await mysql.createConnection({
    host: "mozar24.mysql.tools", database: "mozar24_zipper", user: "mozar24_zipper",
    password: "IUfdy#%&@tewWu2342", connectTimeout: 15000, charset: "utf8mb4",
  });

  const [allMy] = await my.query("SELECT * FROM products");

  console.log("=== Diffing against Supabase (full catalog) ===");
  const sp = await supaAll("products?select=id,translation_id,lang,pcode&order=id.asc");
  // (translation_id, lang) is the real per-row identity — see the header note
  // on why pcode can't be trusted here.
  const spByTidLang = new Set(sp.map((r) => `${r.translation_id}|${norm(r.lang)}`));
  const missing = allMy.filter((r) => !spByTidLang.has(`${r.translationId}|${norm(r.lang)}`));

  console.log(`MySQL: ${allMy.length}  Supabase: ${sp.length}  Missing now: ${missing.length}`);

  // ── Assertion: everything missing must be part of the known 2026-09-03
  // revert. If a product outside that set is missing, STOP — that's a
  // different problem this script isn't scoped for. ──────────────────────
  const unexpected = missing.filter((r) => !REVERT_DELETE_IDS.has(r.id));
  if (unexpected.length) {
    console.error(`\n✗ ${unexpected.length} missing product(s) are NOT from the 2026-09-03 revert — aborting so this can be looked at:`);
    unexpected.forEach((r) => console.error(`   id=${r.id} tid=${r.translationId} ${r.lang} ${r.pcode}  ${r.title}`));
    await my.end();
    process.exit(1);
  }
  if (!missing.length) {
    console.log("✓ nothing missing — Supabase already covers every live MySQL product. Done.");
    await my.end();
    return;
  }
  console.log(`✓ all ${missing.length} missing rows are from the 2026-09-03 revert, nothing else lost`);

  const missingIds = missing.map((r) => r.id);
  const [cats] = await my.query(`SELECT * FROM products_categories WHERE pid IN (${missingIds.join(",")})`);
  const [photos] = await my.query(`SELECT * FROM products_photos WHERE pid IN (${missingIds.join(",")})`);
  await my.end();
  console.log(`Related rows — products_categories: ${cats.length}  products_photos: ${photos.length}`);

  // ── Resolve images to R2 URLs (HEAD-check only, no upload) ─────────────
  console.log("\n=== Checking images in R2 ===");
  const mainFiles = [...new Set(missing.map((p) => p.img).filter(Boolean))];
  const mainUrl = new Map();
  let mainMissing = 0;
  for (const f of mainFiles) {
    const small = (await r2Has(`products/${f}`)) ? `${R2_PUBLIC_URL}/products/${f}` : null;
    const full = (await r2Has(`products/full/${f}`)) ? `${R2_PUBLIC_URL}/products/full/${f}` : null;
    if (!small) mainMissing++;
    mainUrl.set(f, { small, full });
  }
  const galleryFiles = [...new Set(photos.map((p) => p.img).filter(Boolean))];
  const galleryUrl = new Map();
  let galMissing = 0;
  for (const f of galleryFiles) {
    const g = (await r2Has(`products/gallery/${f}`)) ? `${R2_PUBLIC_URL}/products/gallery/${f}` : null;
    if (!g) galMissing++;
    galleryUrl.set(f, g);
  }
  console.log(`  main images: ${mainFiles.length} (${mainMissing} not in R2)   gallery images: ${galleryFiles.length} (${galMissing} not in R2)`);

  // ── Build product rows ───────────────────────────────────────────────
  const productRows = missing.map((p) => {
    const m = mainUrl.get(p.img) ?? {};
    return {
      id: p.id, translation_id: p.translationId, lang: p.lang, pid: p.pid, filter_id: p.filterId,
      pcode: p.pcode, uri: p.uri, img: m.small ?? p.img ?? "", img2: p.img2, img_full: m.full ?? null,
      title: p.title, main_title: p.main_title, heading: p.heading, descr: p.descr, text: p.text,
      package: p.package, price: p.price, price_sale: p.price_sale,
      price2n: p.price2n, price2: p.price2, price3n: p.price3n, price3: p.price3,
      label_action: p.labelAction, priority: p.priority, popular: p.popular,
      measure: p.measure, minquantity: p.minquantity,
      seo_title: p.seoTitle, seo_key: p.seoKey, seo_descr: p.seoDescr, seo_text: p.seoText,
      active: p.active, main_count: p.main_count, square: p.square, add_place: p.add_place,
      sq1: p.sq1, sq2: p.sq2, sq3: p.sq3, sale: p.sale, map: p.map,
      xml_id: p.xml_id, xml_cat: p.xml_cat, sync_1c: p["1c"],
    };
  });

  console.log(`\n=== Products to insert: ${productRows.length} ===`);
  for (const p of productRows) console.log(`  id=${String(p.id).padEnd(6)} tid=${String(p.translation_id).padEnd(6)} ${p.lang} ${String(p.pcode).padEnd(12)} active=${p.active}  ${String(p.title).slice(0, 60)}`);

  if (DRY) { console.log("\n(DRY RUN — nothing written)"); return; }

  await supaFetch("products", { method: "POST", body: JSON.stringify(productRows), headers: { Prefer: "return=minimal" } });
  console.log(`  ✓ ${productRows.length} products inserted`);

  // ── products_categories — dedupe on (pid,cid) ────────────────────────
  console.log("\n=== Inserting products_categories ===");
  const pids = [...new Set(cats.map((c) => c.pid))];
  const existingPairs = new Set();
  for (let i = 0; i < pids.length; i += 200) {
    const rows = await supaFetch(`products_categories?pid=in.(${pids.slice(i, i + 200).join(",")})&select=pid,cid`);
    rows.forEach((r) => existingPairs.add(`${r.pid}:${r.cid}`));
  }
  const catRows = cats.filter((c) => !existingPairs.has(`${c.pid}:${c.cid}`)).map((c) => ({ id: c.id, pid: c.pid, cid: c.cid }));
  if (catRows.length) {
    await supaFetch("products_categories?on_conflict=pid,cid", { method: "POST", body: JSON.stringify(catRows), headers: { Prefer: "return=minimal,resolution=ignore-duplicates" } });
  }
  console.log(`  ✓ ${catRows.length} category links inserted (${cats.length - catRows.length} already present)`);

  // ── products_photos — dedupe on id ──────────────────────────────────
  console.log("\n=== Inserting products_photos ===");
  const photoIds = photos.map((p) => p.id);
  const existingPhotoIds = new Set();
  for (let i = 0; i < photoIds.length; i += 500) {
    const rows = await supaFetch(`products_photos?id=in.(${photoIds.slice(i, i + 500).join(",")})&select=id`);
    rows.forEach((r) => existingPhotoIds.add(r.id));
  }
  const photoRows = photos.filter((p) => !existingPhotoIds.has(p.id)).map((p) => ({
    id: p.id, pid: p.pid, translation_id: p.translationId ?? null, lang: p.lang ?? "ru",
    img: galleryUrl.get(p.img) ?? (p.img ? `${R2_PUBLIC_URL}/products/gallery/${p.img}` : p.img),
    title: p.title || null, priority: p.priority ?? 20, img_full: null,
  }));
  for (let i = 0; i < photoRows.length; i += 200) {
    await supaFetch("products_photos?on_conflict=id", { method: "POST", body: JSON.stringify(photoRows.slice(i, i + 200)), headers: { Prefer: "return=minimal,resolution=ignore-duplicates" } });
  }
  console.log(`  ✓ ${photoRows.length} gallery photos inserted (${photos.length - photoRows.length} already present)`);

  console.log("\n=== DONE ===");
  console.log(`Products: ${productRows.length}  Categories: ${catRows.length}  Photos: ${photoRows.length}`);
  if (mainMissing || galMissing) console.log(`⚠ images not found in R2 — main: ${mainMissing}, gallery: ${galMissing} (product rows still inserted, with a bare filename)`);
}

main().catch((e) => { console.error("\nFATAL:", e.message); process.exit(1); });
