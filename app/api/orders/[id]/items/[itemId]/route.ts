import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { auth } from "@/lib/auth";
import { getUahRate, resolveOrderDiscountPercent, computeItemPricingForProduct } from "@/lib/pricing";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, itemId } = await params;
  const orderId = parseInt(id);
  const parsedItemId = parseInt(itemId);
  const body = await req.json();

  const { data: existing } = await supabaseServer
    .from("orders_item")
    .select("price, price_base, quantity, product, price_manual")
    .eq("id", parsedItemId).eq("oid", orderId).maybeSingle();
  if (!existing) return NextResponse.json({ error: "Товар не знайдено" }, { status: 404 });

  const update: { price?: number; price_base?: number; quantity?: number; active?: boolean; price_manual?: boolean } = {};
  let manualPriceEdit = false;

  if (body.price !== undefined) {
    const price = parseFloat(body.price);
    if (!Number.isFinite(price) || price < 0) return NextResponse.json({ error: "Некоректна ціна" }, { status: 400 });

    // Flag this line as manually priced ONLY when the incoming price
    // genuinely differs from what's stored — the main "editingItems" row
    // editor always submits both price and quantity together, so a
    // quantity-only edit there would otherwise resend the unchanged price
    // and wrongly mark it manual, permanently exempting it from the
    // automatic category/tier/client-discount recompute below and in
    // app/api/orders/[id]/process/route.ts.
    if (Math.abs(price - Number(existing.price)) > 0.001) {
      update.price = price;
      update.price_manual = true;
      manualPriceEdit = true;
    }
  }

  if (body.quantity !== undefined) {
    const quantity = parseInt(body.quantity);
    if (!Number.isFinite(quantity) || quantity < 1) return NextResponse.json({ error: "Некоректна кількість" }, { status: 400 });
    update.quantity = quantity;

    // A category/quantity-tier bulk discount (lib/pricing.ts's
    // computeItemPricingForProduct — same priority the storefront's own
    // cart.php uses) depends on quantity, so changing it here alone used
    // to silently leave the price/discount from whatever tier the OLD
    // quantity qualified for (e.g. still priced at the -20%-at-1000-units
    // rate after being edited down to 200). Recompute it here, exactly
    // like the "змінити %% і надіслати повторно" resend already does —
    // skipped when this same request also carries a genuine manual price
    // (that wins outright) or the line is already flagged price_manual
    // from an earlier explicit edit, which a later quantity tweak must
    // never silently override.
    const quantityChanged = quantity !== Number(existing.quantity);
    if (quantityChanged && !manualPriceEdit && !existing.price_manual) {
      const { data: order } = await supabaseServer
        .from("orders").select("login, discount_percent").eq("id", orderId).maybeSingle();
      if (order) {
        const rate = await getUahRate();
        const discountPercent = await resolveOrderDiscountPercent(order);
        const pricing = await computeItemPricingForProduct(existing.product, quantity, rate, discountPercent);
        // pricing is null only if the product itself was since deleted —
        // leave whatever price the line already has, same fallback
        // app/api/orders/[id]/process/route.ts's own recompute uses.
        if (pricing) {
          update.price = pricing.price;
          update.price_base = pricing.priceBase;
        }
      }
    }
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
