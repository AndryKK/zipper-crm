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
      .select("warehouse_id, quantity, min_quantity")
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < pageSize) break;
  }
  return rows;
}

/* Falls back to computing stats in JS from `inventory` directly when the
 * `warehouse_stats` materialized view hasn't been created yet (run
 * scripts/create-warehouse-stats-view.sql in the Supabase SQL editor —
 * it also schedules a daily pg_cron refresh, so this slow path should only
 * ever be hit on a project where that script hasn't run at all). */
async function computeStatsFallback() {
  const [{ data: warehouses }, inventory] = await Promise.all([
    supabaseServer.from("warehouses").select("*").order("priority"),
    fetchAllInventory(),
  ]);

  return (warehouses || []).map((w: any) => {
    const items = (inventory || []).filter((i: any) => i.warehouse_id === w.id);
    const totalProducts = items.length;
    const totalQty = items.reduce((s: number, i: any) => s + Number(i.quantity), 0);
    const totalMin = items.reduce((s: number, i: any) => s + Number(i.min_quantity), 0);
    const fillPct = totalMin > 0 ? Math.min(100, Math.round((totalQty / totalMin) * 100)) : 0;
    const lowStock = items.filter((i: any) => Number(i.min_quantity) > 0 && Number(i.quantity) <= Number(i.min_quantity)).length;

    let full = 0, medium = 0, low = 0, empty = 0;
    for (const i of items) {
      const qty = Number(i.quantity);
      const min = Number(i.min_quantity);
      if (qty === 0) { empty++; continue; }
      if (min === 0) { full++; continue; }
      const pct = qty / min;
      if (pct >= 0.7) full++;
      else if (pct >= 0.3) medium++;
      else low++;
    }

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
