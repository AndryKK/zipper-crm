/**
 * One-time settings change: every Nova Poshta shipment now goes out from a
 * single sender branch, Відділення №18 — the "габаритні товари" branch
 * that used to be reserved for orders.is_oversized orders only, while
 * everything else went through a separately-configured "main" branch
 * (Відділення №100). That distinction, orders.is_oversized, the "Товари
 * габаритні" checkbox, and the "Відправити з Відділення №100" retry button
 * are all gone now (see lib/order-ttn.ts, app/(admin)/orders/[id]/page.tsx).
 *
 * Just repoints the existing np_sender_warehouse_ref setting at the same
 * Ref np_sender_warehouse_ref_oversized already held — no schema change,
 * that second setting row is left in place (unused, harmless) rather than
 * deleted.
 *
 * Run: node scripts/set-np-sender-warehouse-18.mjs
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
  const [main, oversized] = await Promise.all([
    supaFetch("settings?value=eq.np_sender_warehouse_ref&select=id,text"),
    supaFetch("settings?value=eq.np_sender_warehouse_ref_oversized&select=id,text"),
  ]);
  if (!oversized?.[0]?.text) throw new Error("np_sender_warehouse_ref_oversized has no value to copy from");
  console.log("Before:", main?.[0]);
  const updated = await supaFetch(`settings?id=eq.${main[0].id}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ text: oversized[0].text }),
  });
  console.log("After:", updated?.[0]);
}

main().catch((e) => { console.error("FATAL:", e.message); process.exit(1); });
