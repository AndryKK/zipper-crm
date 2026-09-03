/**
 * Continuation of import-missing-products-2026-09-03.mjs — that script's
 * products insert (55 rows) and all image uploads succeeded, but the
 * products_categories insert hit a pre-existing duplicate
 * (pid=8909, cid=1 already existed in Supabase from some earlier partial
 * state, unrelated to this run) and aborted before photos ran. This finishes
 * just the categories + photos inserts for exactly those same 55 products'
 * pids (from the scoped scratch JSON already fetched during investigation —
 * NOT a fresh whole-catalog MySQL query, which would incorrectly touch every
 * category/photo link in the entire catalog), skipping whatever's already
 * present instead of erroring on it.
 *
 * Run: node scripts/finish-missing-products-2026-09-03.mjs
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
const R2_PUBLIC_URL = env.NEXT_PUBLIC_R2_PUBLIC_URL;

const SCRATCH = "C:\\Users\\Pk\\AppData\\Local\\Temp\\claude\\c--avian-code-zipper-new-crm\\c3d7ca61-ffd2-4800-ac67-9ef2765a26a1\\scratchpad";
const categories = JSON.parse(readFileSync(join(SCRATCH, "missing-products-categories.json"), "utf8"));
const photos = JSON.parse(readFileSync(join(SCRATCH, "missing-products-photos.json"), "utf8"));

async function supaFetch(path, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json", ...(opts.headers || {}) },
  });
  if (!res.ok) throw new Error(`${opts.method ?? "GET"} ${path} -> HTTP ${res.status}: ${(await res.text()).slice(0, 500)}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function main() {
  console.log(`Candidate categories: ${categories.length}  Candidate photos: ${photos.length}`);

  // ---- categories: dedupe on (pid, cid) — that's the real unique
  // constraint (products_categories_pid_cid_key), not id. A few of these
  // pairs already exist in Supabase from some earlier partial state even
  // though the product row itself didn't. on_conflict=pid,cid tells
  // PostgREST which constraint ignore-duplicates should skip on. ----
  const existingPairs = new Set();
  const pids = [...new Set(categories.map((c) => c.pid))];
  for (let i = 0; i < pids.length; i += 200) {
    const batch = pids.slice(i, i + 200);
    const rows = await supaFetch(`products_categories?pid=in.(${batch.join(",")})&select=pid,cid`);
    rows.forEach((r) => existingPairs.add(`${r.pid}:${r.cid}`));
  }
  const newCats = categories
    .filter((c) => !existingPairs.has(`${c.pid}:${c.cid}`))
    .map((c) => ({ id: c.id, pid: c.pid, cid: c.cid }));
  console.log(`New categories to insert: ${newCats.length} (${categories.length - newCats.length} already present)`);
  for (let i = 0; i < newCats.length; i += 200) {
    await supaFetch("products_categories?on_conflict=pid,cid", { method: "POST", body: JSON.stringify(newCats.slice(i, i + 200)), headers: { Prefer: "return=minimal,resolution=ignore-duplicates" } });
  }
  console.log("✓ categories done");

  // ---- photos: skip ids that already exist ----
  const existingPhotoIds = new Set();
  for (let i = 0; i < photos.length; i += 500) {
    const batch = photos.slice(i, i + 500).map((p) => p.id);
    const rows = await supaFetch(`products_photos?id=in.(${batch.join(",")})&select=id`);
    rows.forEach((r) => existingPhotoIds.add(r.id));
  }
  const newPhotos = photos.filter((p) => !existingPhotoIds.has(p.id));
  console.log(`New photos to insert: ${newPhotos.length} (${photos.length - newPhotos.length} already present)`);

  // Gallery images were already uploaded to R2 by the main script (key:
  // products/gallery/{filename}) — just build the URL, no re-upload needed.
  const photoRows = newPhotos.map((p) => ({
    id: p.id, pid: p.pid, translation_id: p.translationId ?? null, lang: p.lang ?? "ru",
    img: p.img ? `${R2_PUBLIC_URL}/products/gallery/${p.img}` : p.img,
    title: p.title || null, priority: p.priority ?? 20, img_full: null,
  }));
  for (let i = 0; i < photoRows.length; i += 200) {
    await supaFetch("products_photos?on_conflict=id", { method: "POST", body: JSON.stringify(photoRows.slice(i, i + 200)), headers: { Prefer: "return=minimal,resolution=ignore-duplicates" } });
  }
  console.log("✓ photos done");

  console.log("\n=== DONE ===");
}

main().catch((e) => { console.error("FATAL:", e.message); process.exit(1); });
