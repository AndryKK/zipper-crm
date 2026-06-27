import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";

export async function GET() {
  const [{ data: warehouses }, { data: inventory }] = await Promise.all([
    supabaseServer.from("warehouses").select("*").order("priority"),
    supabaseServer.from("inventory").select("warehouse_id, quantity, initial_quantity, min_quantity, reserved"),
  ]);

  if (!warehouses) return NextResponse.json([]);

  const stats = warehouses.map((w: any) => {
    const items = (inventory || []).filter((i: any) => i.warehouse_id === w.id);
    const totalProducts = items.length;
    const totalQty = items.reduce((s: number, i: any) => s + Number(i.quantity), 0);
    const totalInitial = items.reduce((s: number, i: any) => s + Number(i.initial_quantity), 0);
    const fillPct = totalInitial > 0 ? Math.min(100, Math.round((totalQty / totalInitial) * 100)) : 0;
    const lowStock = items.filter((i: any) => Number(i.min_quantity) > 0 && Number(i.quantity) <= Number(i.min_quantity)).length;

    let full = 0, medium = 0, low = 0, empty = 0;
    for (const i of items) {
      const qty = Number(i.quantity);
      const init = Number(i.initial_quantity);
      if (qty === 0) { empty++; continue; }
      if (init === 0) { full++; continue; }
      const pct = qty / init;
      if (pct >= 0.7) full++;
      else if (pct >= 0.3) medium++;
      else low++;
    }

    return { ...w, totalProducts, totalQty, totalInitial, fillPct, lowStock, distribution: { full, medium, low, empty } };
  });

  return NextResponse.json(stats);
}
