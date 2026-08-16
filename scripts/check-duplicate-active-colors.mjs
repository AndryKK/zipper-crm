// Read-only integrity check: every color group (connected component over
// products_colors, keyed by translation_id — see docs/product-colors.md)
// must have exactly one translation_id with active=1. Two or more means
// the storefront shows them as separate products instead of one with a
// color picker (the 2026-08-16 bs10280/bs10319 incident this script was
// written to catch any repeats of).
//
// Usage: node scripts/check-duplicate-active-colors.mjs
// Prints one line per broken group; exits 0 either way (informational —
// fixing a broken group needs a human decision about which color should
// stay active, use the "Зробити цей колір основним" button in the CRM).
import "dotenv/config";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const headers = { apikey: key, Authorization: `Bearer ${key}` };

async function fetchAllPages(path, pageSize = 1000) {
  const rows = [];
  for (let offset = 0; ; offset += pageSize) {
    const sep = path.includes("?") ? "&" : "?";
    const res = await fetch(`${url}${path}${sep}offset=${offset}&limit=${pageSize}`, { headers });
    const page = await res.json();
    if (!Array.isArray(page) || !page.length) break;
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows;
}

// Union-find over translation_ids connected via products_colors edges.
const parent = new Map();
function find(x) {
  if (!parent.has(x)) parent.set(x, x);
  while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); }
  return x;
}
function union(a, b) {
  const ra = find(a), rb = find(b);
  if (ra !== rb) parent.set(ra, rb);
}

const links = await fetchAllPages("/rest/v1/products_colors?select=pid,pid_with");
for (const { pid, pid_with } of links) union(pid, pid_with);

const activeRows = await fetchAllPages("/rest/v1/products?select=translation_id,pcode,lang&active=eq.1");

const byRoot = new Map();
for (const row of activeRows) {
  if (!parent.has(row.translation_id)) continue; // not part of any color group — trivially fine
  const root = find(row.translation_id);
  if (!byRoot.has(root)) byRoot.set(root, new Map());
  const trMap = byRoot.get(root);
  if (!trMap.has(row.translation_id)) trMap.set(row.translation_id, []);
  trMap.get(row.translation_id).push(`${row.pcode}(${row.lang})`);
}

let broken = 0;
for (const [root, trMap] of byRoot) {
  if (trMap.size <= 1) continue;
  broken++;
  console.log(`Group (root translation_id ${root}) has ${trMap.size} active=1 colors:`);
  for (const [trId, rows] of trMap) console.log(`  translation_id=${trId}: ${rows.join(", ")}`);
}

console.log(broken ? `\n${broken} broken group(s) found.` : "No broken groups found — every color group has exactly one active=1.");
