import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { auth } from "@/lib/auth";
import { uploadToR2 } from "@/lib/r2";

// End-of-day snapshot of every product's current warehouse quantity —
// added right after the 2026-09-08 full inventory reset (see
// scripts/reset-all-inventory.js) so the fresh re-count being entered from
// a clean slate has a running daily backup to recover from. Only products
// that actually carry stock right now are included — a snapshot of the
// other ~9,000 untouched-since-the-reset rows would just be noise.
//
// Shape: {"all": [{"z10236": 1000}, {"xt23581": 5400}, ...]}. Quantity is
// summed across every warehouse per product (there are only two right
// now, and the ask was "current quantity" per product, not a per-
// warehouse breakdown) — see inventory_daily_backups' own table comment.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const isCron = process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`;
  if (!isCron) {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: rows, error } = await supabaseServer
    .from("inventory")
    .select("quantity, product:products!inventory_product_id_fkey(pcode)")
    .gt("quantity", 0);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const byPcode = new Map<string, number>();
  for (const row of (rows ?? []) as unknown as { quantity: number; product: { pcode: string } | null }[]) {
    const pcode = row.product?.pcode;
    if (!pcode) continue; // orphaned inventory row (product since deleted) — nothing to snapshot it under
    byPcode.set(pcode, (byPcode.get(pcode) ?? 0) + row.quantity);
  }

  const data = { all: Array.from(byPcode, ([pcode, quantity]) => ({ [pcode]: quantity })) };
  const today = new Date().toISOString().slice(0, 10); // UTC date, same convention every other cron here already runs on

  let r2Url: string | null = null;
  try {
    const json = JSON.stringify(data, null, 2);
    const bytes = new TextEncoder().encode(json);
    r2Url = await uploadToR2(`inventory-backups/${today}.json`, bytes.buffer, "application/json");
  } catch (e) {
    // Never let an R2 outage block the DB copy below — that alone is
    // still a complete, queryable backup for the day.
    console.error("[inventory-daily-backup] R2 upload failed:", (e as Error).message);
  }

  // Upsert on backup_date — a manual re-run on the same day (e.g. after
  // fixing an R2 credential issue) replaces that day's snapshot instead of
  // erroring on the UNIQUE constraint or leaving a stale duplicate.
  const { error: upsertError } = await supabaseServer
    .from("inventory_daily_backups")
    .upsert({ backup_date: today, data, r2_url: r2Url }, { onConflict: "backup_date" });
  if (upsertError) return NextResponse.json({ error: upsertError.message }, { status: 500 });

  return NextResponse.json({ date: today, products: byPcode.size, r2Url });
}
