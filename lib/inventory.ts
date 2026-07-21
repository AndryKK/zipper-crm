import { supabaseServer } from "@/lib/supabase";

// The single warehouse used for automatic stock reservation/release —
// same "lowest priority, active" convention already used by the order
// process/confirm-payment routes for picking their primary warehouse.
export async function getDefaultWarehouseId(): Promise<number | null> {
  const { data } = await supabaseServer
    .from("warehouses")
    .select("id")
    .eq("active", 1)
    .order("priority", { ascending: true })
    .limit(1)
    .single();
  return data?.id ?? null;
}

export type InventorySource =
  | "manual"
  | "order_created"
  | "order_item_updated"
  | "order_item_deleted"
  | "order_cancelled"
  | "order_uncancelled"
  | "return_received";

export type AdjustOpts = {
  source: InventorySource;
  changedBy?: string | null; // adm_users.login — null/omitted means an automatic ("система") change
  note?: string | null;
};

// Adds `delta` to inventory.quantity for (productId, warehouseId). Negative
// delta deducts stock and is allowed to go below zero (reservations can
// exceed what's physically counted until real stock levels are entered).
// Not transactionally atomic (read-then-write via PostgREST, same pattern
// already used by confirm-payment/route.ts) — acceptable at this order volume.
// Every adjustment is recorded in inventory_history for the audit trail.
export async function adjustInventory(
  productId: number, warehouseId: number, delta: number, opts: AdjustOpts
): Promise<void> {
  if (!delta) return;

  const { data: row } = await supabaseServer
    .from("inventory")
    .select("id, quantity")
    .eq("product_id", productId)
    .eq("warehouse_id", warehouseId)
    .maybeSingle();

  const before = row ? Number(row.quantity) : 0;
  const after = before + delta;

  if (row) {
    await supabaseServer.from("inventory").update({ quantity: after }).eq("id", row.id);
  } else {
    await supabaseServer
      .from("inventory")
      .insert({ product_id: productId, warehouse_id: warehouseId, quantity: after });
  }

  await supabaseServer.from("inventory_history").insert({
    product_id: productId,
    warehouse_id: warehouseId,
    quantity_before: before,
    quantity_after: after,
    delta,
    source: opts.source,
    changed_by: opts.changedBy ?? null,
    note: opts.note ?? null,
  });
}

export async function deductStock(productId: number, quantity: number, warehouseId: number, opts: AdjustOpts): Promise<void> {
  await adjustInventory(productId, warehouseId, -quantity, opts);
}

export async function restockStock(productId: number, quantity: number, warehouseId: number, opts: AdjustOpts): Promise<void> {
  await adjustInventory(productId, warehouseId, quantity, opts);
}

export async function restockOrderItems(oid: number, warehouseId: number, opts: AdjustOpts): Promise<void> {
  const { data: items } = await supabaseServer.from("orders_item").select("product, quantity").eq("oid", oid);
  for (const item of items ?? []) {
    await restockStock(item.product, item.quantity, warehouseId, opts);
  }
}

export async function deductOrderItems(oid: number, warehouseId: number, opts: AdjustOpts): Promise<void> {
  const { data: items } = await supabaseServer.from("orders_item").select("product, quantity").eq("oid", oid);
  for (const item of items ?? []) {
    await deductStock(item.product, item.quantity, warehouseId, opts);
  }
}
