/**
 * Fixes a real gap left by finish-missing-products-2026-09-03.mjs: 208 of
 * the 522 products_photos rows for the 55 missing products (from
 * import-missing-products-2026-09-03.mjs) were never actually inserted.
 *
 * Root cause: those 208 rows' MySQL-source ids happened to already be used
 * in Supabase's products_photos by completely UNRELATED, pre-existing
 * products (e.g. source id 54805, meant for pid=10325, already belonged to
 * pid=136 in Supabase — some earlier sequence-vs-explicit-id drift, nothing
 * to do with this sync). finish-*.mjs's id-based ON CONFLICT (id) DO NOTHING
 * correctly avoided overwriting that unrelated existing row (never touched
 * an existing product, per the explicit instruction) — but that also meant
 * it silently skipped inserting the real, needed row for the missing
 * product instead of just picking a different id for it.
 *
 * products_photos.id has no external significance (unlike products.id,
 * which the uk/ru translation_id pairing depends on) — the CRM groups
 * gallery photos by their `img` URL, not by id (see product-form.tsx's
 * dedupeByImg). So this just re-inserts those 208 rows with a
 * database-generated id instead of the MySQL source id.
 *
 * Run: node scripts/fix-photo-id-collisions-2026-09-03.mjs
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
  const ids = photos.map((p) => p.id);
  const existing = await supaFetch(`products_photos?id=in.(${ids.join(",")})&select=id,pid`);
  const existingById = new Map(existing.map((r) => [r.id, r.pid]));

  const collisions = photos.filter((p) => existingById.has(p.id) && existingById.get(p.id) !== p.pid);
  const genuineDupes = photos.filter((p) => existingById.get(p.id) === p.pid);
  const neverInserted = photos.filter((p) => !existingById.has(p.id));
  console.log(`Source rows: ${photos.length}`);
  console.log(`  Genuine duplicates (already correct, skip): ${genuineDupes.length}`);
  console.log(`  Id collisions with unrelated products (need re-insert w/ fresh id): ${collisions.length}`);
  console.log(`  Never inserted at all (also need insert): ${neverInserted.length}`);

  const toInsert = [...collisions, ...neverInserted].map((p) => ({
    // id omitted on purpose — let Postgres assign a fresh one.
    pid: p.pid, translation_id: p.translationId ?? null, lang: p.lang ?? "ru",
    img: p.img ? `${R2_PUBLIC_URL}/products/gallery/${p.img}` : p.img,
    title: p.title || null, priority: p.priority ?? 20, img_full: null,
  }));
  console.log(`\nInserting ${toInsert.length} rows with fresh ids...`);
  for (let i = 0; i < toInsert.length; i += 200) {
    await supaFetch("products_photos", { method: "POST", body: JSON.stringify(toInsert.slice(i, i + 200)), headers: { Prefer: "return=minimal" } });
    process.stdout.write(`\r  ${Math.min(i + 200, toInsert.length)}/${toInsert.length}`);
  }
  console.log("\n✓ done");
}

main().catch((e) => { console.error("FATAL:", e.message); process.exit(1); });
