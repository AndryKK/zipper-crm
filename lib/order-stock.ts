import { supabaseServer } from "@/lib/supabase";

export type StockCheckResult = { status: "ok" | "warn"; msg: string };

// Informational only — compares each line item's ordered quantity against
// the top-2-priority active warehouses' on-hand quantity. Shared by the
// automatic process pipeline and the manual "Ручне керування" panel so
// both run the exact same check.
export async function checkOrderStock(orderId: number): Promise<StockCheckResult> {
  // active=false rows are removed from the order (see
  // scripts/add-orders-item-active-column.sql) — nothing to stock-check
  // for something that's no longer actually being shipped.
  const { data: items } = await supabaseServer.from("orders_item").select("*").eq("oid", orderId).eq("active", true);
  if (!items?.length) return { status: "warn", msg: "Замовлення без товарів" };

  const { data: warehouses } = await supabaseServer
    .from("warehouses").select("id, title, priority")
    .eq("active", 1).order("priority", { ascending: true }).limit(2);
  const wh0 = warehouses?.[0];
  const wh1 = warehouses?.[1];

  const productIds = (items as { product: number }[]).map((i) => i.product);
  const { data: inventory } = await supabaseServer
    .from("inventory").select("product_id, warehouse_id, quantity")
    .in("product_id", productIds)
    .in("warehouse_id", [wh0?.id, wh1?.id].filter(Boolean));

  const invMap: Record<string, number> = {};
  for (const row of inventory ?? []) invMap[`${row.product_id}_${row.warehouse_id}`] = Number(row.quantity);

  const stockIssues: string[] = [];
  for (const item of items as { product: number; quantity: number }[]) {
    const q0 = wh0 ? (invMap[`${item.product}_${wh0.id}`] ?? 0) : 0;
    const q1 = wh1 ? (invMap[`${item.product}_${wh1.id}`] ?? 0) : 0;
    const total = q0 + q1;
    if (total < item.quantity) stockIssues.push(`Товар #${item.product}: потрібно ${item.quantity}, є ${total}`);
  }

  return stockIssues.length
    ? { status: "warn", msg: stockIssues.join("; ") }
    : { status: "ok", msg: "Всі товари в наявності" };
}
