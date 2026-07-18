import { NextRequest, NextResponse } from "next/server";
import { getDefaultWarehouseId, deductStock, restockStock, restockOrderItems, deductOrderItems } from "@/lib/inventory";

const CANCELLED_STATUS = "Скасовано";

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
      await deductStock(payload.record.product, payload.record.quantity, warehouseId);
    } else if (payload.type === "UPDATE") {
      // Return the previous quantity, then deduct the corrected one — also
      // correctly handles the (rare) case where the product itself changed.
      await restockStock(payload.old_record.product, payload.old_record.quantity, warehouseId);
      await deductStock(payload.record.product, payload.record.quantity, warehouseId);
    } else if (payload.type === "DELETE") {
      await restockStock(payload.old_record.product, payload.old_record.quantity, warehouseId);
    }
  } else if (payload.table === "orders" && payload.type === "UPDATE") {
    const wasCancelled = payload.old_record.status === CANCELLED_STATUS;
    const isCancelled = payload.record.status === CANCELLED_STATUS;
    if (isCancelled && !wasCancelled) {
      await restockOrderItems(payload.record.id, warehouseId);
    } else if (wasCancelled && !isCancelled) {
      await deductOrderItems(payload.record.id, warehouseId);
    }
  }

  return NextResponse.json({ success: true });
}
