import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { auth } from "@/lib/auth";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, itemId } = await params;
  const orderId = parseInt(id);
  const parsedItemId = parseInt(itemId);
  const body = await req.json();

  const update: { price?: number; quantity?: number; active?: boolean; price_manual?: boolean } = {};
  if (body.price !== undefined) {
    const price = parseFloat(body.price);
    if (!Number.isFinite(price) || price < 0) return NextResponse.json({ error: "Некоректна ціна" }, { status: 400 });
    update.price = price;

    // Flag this line as manually priced ONLY when the incoming price
    // genuinely differs from what's stored — the main "editingItems" row
    // editor always submits both price and quantity together, so a
    // quantity-only edit there would otherwise resend the unchanged price
    // and wrongly mark it manual, permanently exempting it from the
    // automatic category/tier/client-discount recompute in
    // app/api/orders/[id]/process/route.ts for no reason.
    const { data: existing } = await supabaseServer
      .from("orders_item").select("price").eq("id", parsedItemId).eq("oid", orderId).maybeSingle();
    if (existing && Math.abs(price - Number(existing.price)) > 0.001) {
      update.price_manual = true;
    }
  }
  if (body.quantity !== undefined) {
    const quantity = parseInt(body.quantity);
    if (!Number.isFinite(quantity) || quantity < 1) return NextResponse.json({ error: "Некоректна кількість" }, { status: 400 });
    update.quantity = quantity;
  }
  // Soft-remove/restore — see scripts/add-orders-item-active-column.sql.
  // The webhook (app/api/webhooks/inventory-sync/route.ts) reacts to this
  // exact UPDATE to restock/deduct, so this is the only place that flag
  // should ever be written from.
  if (body.active !== undefined) {
    update.active = !!body.active;
  }

  const { data: item, error } = await supabaseServer
    .from("orders_item")
    .update(update)
    .eq("id", parsedItemId)
    .eq("oid", orderId)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(item);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, itemId } = await params;
  const orderId = parseInt(id);

  const { error } = await supabaseServer
    .from("orders_item")
    .delete()
    .eq("id", parseInt(itemId))
    .eq("oid", orderId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
