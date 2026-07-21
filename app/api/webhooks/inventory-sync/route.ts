import { NextRequest, NextResponse } from "next/server";
import { getDefaultWarehouseId, deductStock, restockStock, restockOrderItems, deductOrderItems } from "@/lib/inventory";

const CANCELLED_STATUS = "Скасовано";
// Statuses reached before the order physically leaves the warehouse — an
// order cancelled while still in one of these auto-restocks. Once it's
// "Відправлено" (or later), the goods are already out; restocking only
// happens when a return is confirmed received back (see the returns flow).
const PRE_SHIPMENT_STATUSES = new Set(["Новий", "В роботі", "Оплачено"]);
const isPreShipment = (status: string | null) => !status || PRE_SHIPMENT_STATUSES.has(status);

type OrdersItemRow = { oid: number; product: number; quantity: number };
type OrdersRow = { id: number; status: string | null };

type WebhookPayload =
  | { type: "INSERT"; table: "orders_item"; record: OrdersItemRow; old_record: null }
  | { type: "UPDATE"; table: "orders_item"; record: OrdersItemRow; old_record: OrdersItemRow }
  | { type: "DELETE"; table: "orders_item"; record: null; old_record: OrdersItemRow }
  | { type: "UPDATE"; table: "orders"; record: OrdersRow; old_record: OrdersRow };

// Receives Supabase Database Webhooks (configured in the Supabase dashboard,
// see docs/inventory-webhooks.md) that fire on INSERT/UPDATE/DELETE of
// `orders_item` and on UPDATE of `orders` — this is what keeps warehouse
// stock in sync with the order lifecycle without any code in this app ever
// creating an order itself (orders always arrive already-created from the
// storefront/import).
export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-webhook-secret");
  if (!secret || secret !== process.env.INVENTORY_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = (await req.json()) as WebhookPayload;
  const warehouseId = await getDefaultWarehouseId();
  if (!warehouseId) {
    return NextResponse.json({ error: "No active warehouse configured" }, { status: 200 });
  }

  if (payload.table === "orders_item") {
    if (payload.type === "INSERT") {
      await deductStock(payload.record.product, payload.record.quantity, warehouseId, { source: "order_created" });
    } else if (payload.type === "UPDATE") {
      await restockStock(payload.old_record.product, payload.old_record.quantity, warehouseId, { source: "order_item_updated", note: "попередня кількість" });
      await deductStock(payload.record.product, payload.record.quantity, warehouseId, { source: "order_item_updated", note: "нова кількість" });
    } else if (payload.type === "DELETE") {
      await restockStock(payload.old_record.product, payload.old_record.quantity, warehouseId, { source: "order_item_deleted" });
    }
  } else if (payload.table === "orders" && payload.type === "UPDATE") {
    const wasCancelled = payload.old_record.status === CANCELLED_STATUS;
    const isCancelled = payload.record.status === CANCELLED_STATUS;

    if (isCancelled && !wasCancelled && isPreShipment(payload.old_record.status)) {
      // Cancelled before it shipped — nothing physically left the warehouse yet.
      await restockOrderItems(payload.record.id, warehouseId, { source: "order_cancelled" });
    } else if (wasCancelled && !isCancelled && isPreShipment(payload.record.status)) {
      // Reactivated back into a pre-shipment state — re-reserve the stock.
      await deductOrderItems(payload.record.id, warehouseId, { source: "order_uncancelled" });
    }
  }

  return NextResponse.json({ success: true });
}
