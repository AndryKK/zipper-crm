import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { auth } from "@/lib/auth";
import { getDefaultWarehouseId, restockStock } from "@/lib/inventory";
import { RETURN_STATUS, RETURN_STATUSES } from "@/lib/returns";

// Updates a return's status (and optionally links it to a product/quantity —
// needed for legacy storefront-submitted returns, which arrive with only a
// free-text title/quantity, no structured product/qty). Restocking the
// warehouse happens ONLY here, ONLY on the transition into
// RETURN_STATUS.RECEIVED, and only once (guarded by `restocked`). Not
// order-scoped — legacy returns don't have an `oid` at all.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ returnId: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { returnId } = await params;
  const body = await req.json();

  if (body.status !== undefined && !RETURN_STATUSES.includes(body.status)) {
    return NextResponse.json({ error: "Невідомий статус" }, { status: 400 });
  }

  const { data: existing } = await supabaseServer
    .from("orders_returns")
    .select("*")
    .eq("id", parseInt(returnId))
    .single();
  if (!existing) return NextResponse.json({ error: "Повернення не знайдено" }, { status: 404 });

  const update: Record<string, unknown> = {};
  if (body.status !== undefined) update.status = body.status;
  if (body.product !== undefined) update.product = body.product === null ? null : parseInt(body.product);
  if (body.qty !== undefined) update.qty = body.qty === null ? null : parseInt(body.qty);
  if (body.notes !== undefined) update.notes = body.notes?.trim() || null;
  if (body.ttn !== undefined) update.ttn = body.ttn?.trim() || null;
  if (body.refunded !== undefined) {
    update.refunded = !!body.refunded;
    update.refunded_at = body.refunded ? new Date().toISOString() : null;
  }

  const movingToReceived = body.status === RETURN_STATUS.RECEIVED && existing.status !== RETURN_STATUS.RECEIVED;

  if (movingToReceived && !existing.restocked) {
    const product = update.product !== undefined ? (update.product as number | null) : existing.product;
    const qty = update.qty !== undefined ? (update.qty as number | null) : existing.qty;
    if (!product || !qty || qty < 1) {
      return NextResponse.json({ error: "Спершу вкажіть товар і кількість для цього повернення" }, { status: 400 });
    }

    const warehouseId = existing.warehouse_id ?? (await getDefaultWarehouseId());
    if (!warehouseId) return NextResponse.json({ error: "Жодного складу не налаштовано" }, { status: 400 });

    await restockStock(product, qty, warehouseId, {
      source: "return_received",
      changedBy: session.user?.name ?? null,
      note: `Повернення #${returnId}`,
    });

    update.warehouse_id = warehouseId;
    update.restocked = true;
  }

  const { data: updated, error } = await supabaseServer
    .from("orders_returns")
    .update(update)
    .eq("id", parseInt(returnId))
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(updated);
}
