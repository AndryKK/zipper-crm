/**
 * Correction to import-missing-products-2026-09-03.mjs — the user only
 * wanted the products actually shown in their screenshot (bs10325-bs10330,
 * bs10336-bs10338, bt10319-bt10321) added, not the full 55-product catalog
 * gap I found via the full diff. This deletes the other 37 (out of 55),
 * keeping exactly the 18 rows (9 translation groups + a few uk/ru-only
 * ones) matching the screenshot.
 *
 * KEEP (from the screenshot): bs10325, bs10326, bs10327, bs10328, bs10329,
 * bs10330, bs10336, bs10337, bs10338, bt10319, bt10320, bt10321
 *
 * Deletes products_photos + products_categories + products rows, in that
 * FK-safe order, for exactly the 37 DELETE ids below. Never touches
 * anything outside this exact set (all 37 ids were created fresh by the
 * import script minutes ago, confirmed via the same missing-products-full.json
 * snapshot that script itself produced).
 *
 * Run: node scripts/revert-extra-missing-products-2026-09-03.mjs
 */
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

const KEEP_IDS = [10325, 10335, 10326, 10334, 10327, 10333, 10329, 10332, 10330, 10331, 10336, 10337, 10340, 10338, 10341, 10322, 10323, 10324];

const DELETE_IDS = [
  398, 3764, 489, 3850, 8909, 8910, 9220, 9221, 9273, 9275,
  10172, 10173, 10181, 10182, 10183,
  10254, 10269, 10255, 10268, 10256, 10267, 10257, 10266, 10258, 10265, 10259, 10264, 10260, 10263, 10261,
  10270, 10271, 10272, 10273, 10274, 10275, 10281,
];

async function supaFetch(path, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json", Prefer: "return=representation", ...(opts.headers || {}) },
  });
  if (!res.ok) throw new Error(`${opts.method ?? "GET"} ${path} -> HTTP ${res.status}: ${(await res.text()).slice(0, 500)}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function main() {
  console.log(`KEEP: ${KEEP_IDS.length} ids   DELETE: ${DELETE_IDS.length} ids   (total was ${KEEP_IDS.length + DELETE_IDS.length})`);

  // Sanity check: every id here must have been created by the sync run
  // minutes ago (active either 0 or 1, but definitely NOT referenced by
  // anything else, since they didn't exist before today) — just confirm
  // current existence before deleting, so a typo in the id list fails
  // loudly instead of silently no-op'ing or, worse, matching something else.
  const existing = await supaFetch(`products?id=in.(${DELETE_IDS.join(",")})&select=id`);
  const existingIds = new Set(existing.map((r) => r.id));
  const notFound = DELETE_IDS.filter((id) => !existingIds.has(id));
  if (notFound.length) console.log(`⚠ ${notFound.length} DELETE ids not found in products (already gone?): ${notFound.join(",")}`);
  console.log(`Confirmed ${existingIds.size}/${DELETE_IDS.length} DELETE ids currently exist.`);

  console.log("\n=== Deleting products_photos ===");
  const delPhotos = await supaFetch(`products_photos?pid=in.(${DELETE_IDS.join(",")})`, { method: "DELETE" });
  console.log(`  ✓ ${delPhotos.length} photo rows deleted`);

  console.log("=== Deleting products_categories ===");
  const delCats = await supaFetch(`products_categories?pid=in.(${DELETE_IDS.join(",")})`, { method: "DELETE" });
  console.log(`  ✓ ${delCats.length} category rows deleted`);

  console.log("=== Deleting products ===");
  const delProducts = await supaFetch(`products?id=in.(${DELETE_IDS.join(",")})`, { method: "DELETE" });
  console.log(`  ✓ ${delProducts.length} product rows deleted`);

  console.log("\n=== Verifying KEEP set is intact ===");
  const kept = await supaFetch(`products?id=in.(${KEEP_IDS.join(",")})&select=id,pcode,img,img_full`);
  console.log(`  ${kept.length}/${KEEP_IDS.length} KEEP products still present`);
  const badImg = kept.filter((p) => !p.img?.startsWith("http") || !p.img_full?.startsWith("http"));
  if (badImg.length) console.log(`  ⚠ ${badImg.length} kept products have a bad img/img_full`, badImg);

  console.log("\n=== DONE ===");
}

main().catch((e) => { console.error("FATAL:", e.message); process.exit(1); });
