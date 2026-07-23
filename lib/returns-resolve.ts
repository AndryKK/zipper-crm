// Server-only. Kept out of lib/returns.ts because that file's RETURN_STATUS
// constants are imported by client components — pulling supabaseServer (the
// service-role client) into that module would leak it into the client bundle.
import { supabaseServer } from "@/lib/supabase";
import { getDefaultWarehouseId } from "@/lib/inventory";

// The storefront's return form is typed on a Ukrainian/Russian keyboard
// layout, so codes that look Latin (e.g. pcode "T2480") sometimes get typed
// with visually-identical Cyrillic letters instead ("Т2480" — Cyrillic Т,
// U+0422). Byte-exact comparison would treat these as different strings, so
// both sides are normalized to Latin lookalikes before matching.
const CYRILLIC_TO_LATIN: Record<string, string> = {
  А: "A", В: "B", Е: "E", К: "K", М: "M", Н: "H", О: "O", Р: "P", С: "C", Т: "T", Х: "X", У: "Y",
  а: "a", е: "e", о: "o", р: "p", с: "c", х: "x", у: "y",
};
function normalizeHomoglyphs(s: string): string {
  return s.replace(/[АВЕКМНОРСТХУаеорсху]/g, (ch) => CYRILLIC_TO_LATIN[ch] ?? ch);
}

// The storefront's return form writes only legacy free-text fields
// (`order`, `code`, `quantity` as text) — never the structured `oid`/
// `product`/`qty` this CRM actually uses to link a return to a real order
// and restock a real product. Every return submitted so far has all three
// legacy fields populated but the structured ones null, so this resolves
// them automatically: `order` → a real orders.id, `code` → matched against
// that order's own orders_item.product pcodes (exact, falling back to a
// prefix match for garbled/truncated codes like "Т2480 ( жо" — cut off
// mid-string, but still starting with the real pcode "T2480" once Cyrillic
// homoglyphs are normalized to Latin). Only resolves when exactly one item
// matches — an ambiguous or non-existent match is left for manual linking
// in the /returns UI rather than guessing.
export async function resolveLegacyReturn(ret: {
  id: number;
  order: number | null;
  code: string | null;
  quantity: string | null;
  oid: number | null;
  product: number | null;
}): Promise<{ oid: number; product: number; qty: number; warehouse_id: number } | null> {
  if (ret.oid || ret.product) return null; // already linked, nothing to do
  if (!ret.order || !ret.code) return null;

  const { data: order } = await supabaseServer.from("orders").select("id").eq("id", ret.order).maybeSingle();
  if (!order) return null;

  const { data: items } = await supabaseServer
    .from("orders_item")
    .select("product, quantity")
    .eq("oid", ret.order);
  if (!items?.length) return null;

  // orders_item.product has no FK to products (checked — only oid→orders
  // exists), so resolve pcodes with a separate lookup rather than an embed.
  const productIds = [...new Set(items.map((it: any) => it.product))];
  const { data: prods } = await supabaseServer.from("products").select("id, pcode").in("id", productIds);
  const pcodeById = new Map((prods ?? []).map((p: any) => [p.id, p.pcode]));

  const code = normalizeHomoglyphs(ret.code.trim());
  const withPcode = items.map((it: any) => ({ ...it, pcode: pcodeById.get(it.product) }));
  const exact = withPcode.filter((it) => it.pcode && normalizeHomoglyphs(it.pcode) === code);
  const matches = exact.length
    ? exact
    : withPcode.filter((it) => it.pcode && code.startsWith(normalizeHomoglyphs(it.pcode)));
  if (matches.length !== 1) return null; // no match, or ambiguous — leave for manual review

  const qtyMatch = (ret.quantity ?? "").match(/\d+/);
  const qty = qtyMatch ? parseInt(qtyMatch[0], 10) : matches[0].quantity;
  const warehouseId = await getDefaultWarehouseId();
  if (!warehouseId) return null;

  const resolved = { oid: ret.order, product: matches[0].product, qty, warehouse_id: warehouseId };
  await supabaseServer.from("orders_returns").update(resolved).eq("id", ret.id);
  return resolved;
}

// Runs resolveLegacyReturn over a batch of rows and returns them with the
// resolution merged in (or unchanged if it couldn't be resolved).
export async function resolveLegacyReturns<T extends { id: number; order: number | null; code: string | null; quantity: string | null; oid: number | null; product: number | null }>(
  rows: T[]
): Promise<T[]> {
  const unresolved = rows.filter((r) => !r.oid && !r.product && r.order && r.code);
  if (!unresolved.length) return rows;

  const resolutions = await Promise.all(unresolved.map((r) => resolveLegacyReturn(r)));
  const byId = new Map(unresolved.map((r, i) => [r.id, resolutions[i]]));
  return rows.map((r) => {
    const res = byId.get(r.id);
    return res ? { ...r, ...res } : r;
  });
}
