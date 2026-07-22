import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";

/* PostgREST caps a single select at its configured max-rows (1000 here), so
 * a plain .select() silently truncates once `inventory` grows past that. */
async function fetchAllInventory() {
  const rows: any[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabaseServer
      .from("inventory")
      .select("warehouse_id, quantity, min_quantity, initial_quantity")
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < pageSize) break;
  }
  return rows;
}

/* Falls back to computing stats in JS from `inventory` directly when the
 * `warehouse_stats` view hasn't been created yet (run
 * scripts/create-warehouse-stats-view.sql in the Supabase SQL editor) —
 * this slow path should only ever be hit on a project where that script
 * hasn't run at all. `warehouse_stats` itself is a plain (live) view, not
 * materialized — see that script for why. */
async function computeStatsFallback() {
  const [{ data: warehouses }, inventory] = await Promise.all([
    supabaseServer.from("warehouses").select("*").order("priority"),
    fetchAllInventory(),
  ]);

  return (warehouses || []).map((w: any) => {
    const items = (inventory || []).filter((i: any) => i.warehouse_id === w.id);
    const totalProducts = items.length;
    // Negative quantity means oversold/over-reserved past what's physically
    // on hand — a deficit to fix, not "negative units" — so it must not
    // subtract from other products' real stock when summed. Clamped to 0
    // per row, same as scripts/create-warehouse-stats-view.sql.
    const totalQty = items.reduce((s: number, i: any) => s + Math.max(0, Number(i.quantity)), 0);
    const totalMin = items.reduce((s: number, i: any) => s + Number(i.min_quantity), 0);
    const lowStock = items.filter((i: any) => Number(i.min_quantity) > 0 && Number(i.quantity) <= Number(i.min_quantity)).length;

    // Fill % is the AVERAGE of each product's own fill %, not a
    // quantity-weighted SUM/SUM ratio — one huge-initial_quantity product
    // sitting at 100% shouldn't be able to drag the whole warehouse to
    // "100%" while thousands of other positions sit empty. See
    // scripts/create-warehouse-stats-view.sql for the full rationale.
    let full = 0, medium = 0, low = 0, empty = 0;
    let pctSum = 0;
    for (const i of items) {
      const qty = Math.max(0, Number(i.quantity));
      const initial = Number(i.initial_quantity);
      const minQ = Number(i.min_quantity);
      const rowPct = initial > 0 ? Math.min(100, (qty / initial) * 100) : (qty > 0 ? 100 : 0);
      pctSum += rowPct;
      if (qty === 0) { empty++; continue; }
      // At/below the reorder threshold is critical — it must never count as
      // "full"/"medium" just because it's 100% of its own (possibly already
      // low) initial_quantity baseline. Wins over the fill-% bucket, same as
      // low_stock above. See scripts/create-warehouse-stats-view.sql.
      if (minQ > 0 && Number(i.quantity) <= minQ) { low++; continue; }
      if (initial === 0) { full++; continue; }
      const pct = qty / initial;
      if (pct >= 0.7) full++;
      else if (pct >= 0.3) medium++;
      else low++;
    }
    const fillPct = totalProducts > 0 ? Math.round(pctSum / totalProducts) : 0;

    return { ...w, totalProducts, totalQty, totalMin, fillPct, lowStock, distribution: { full, medium, low, empty } };
  });
}

export async function GET() {
  const { data, error } = await supabaseServer
    .from("warehouse_stats")
    .select("*")
    .order("priority");

  if (!error) {
    const stats = (data || []).map((w: any) => ({
      id: w.id,
      title: w.title,
      address: w.address,
      priority: w.priority,
      active: w.active,
      totalProducts: w.total_products,
      totalQty: w.total_qty,
      totalMin: w.total_min,
      fillPct: w.fill_pct,
      lowStock: w.low_stock,
      distribution: { full: w.full_count, medium: w.medium_count, low: w.low_count, empty: w.empty_count },
    }));
    return NextResponse.json(stats);
  }

  return NextResponse.json(await computeStatsFallback());
}
