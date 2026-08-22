import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { auth } from "@/lib/auth";
import { getUahRate, resolveOrderDiscountPercent, computeItemPricing } from "@/lib/pricing";
import { isPastPayment } from "@/lib/order-status";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const orderId = parseInt(id);
  const body = await req.json();

  const product  = parseInt(body.product);
  const quantity = parseInt(body.quantity);

  if (!Number.isFinite(product) || !Number.isFinite(quantity) || quantity < 1) {
    return NextResponse.json({ error: "Некоректні дані товару" }, { status: 400 });
  }

  // Price is always recomputed server-side — never trusted from the
  // client. products.price is raw USD-equivalent (same as the legacy
  // storefront); convert via the грн currency rate, then apply this
  // client's own discount (rank-based, or the order's manager override —
  // see lib/pricing.ts) the same way the storefront's own checkout does.
  const [{ data: productRow }, { data: order }] = await Promise.all([
    supabaseServer.from("products").select("price").eq("id", product).single(),
    supabaseServer.from("orders").select("login, discount_percent, status").eq("id", orderId).single(),
  ]);
  if (!productRow) return NextResponse.json({ error: "Товар не знайдено" }, { status: 404 });
  if (!order) return NextResponse.json({ error: "Замовлення не знайдено" }, { status: 404 });

  // Mirrors the order detail page's own "Додати товар до замовлення" gate
  // (which only renders the add-item UI while step < 1, i.e. before
  // Оплачено) — enforced here too so the restriction holds even if a
  // request reaches this endpoint some other way, not just via that button
  // being hidden.
  if (isPastPayment(order.status)) {
    return NextResponse.json({ error: "Додавання товарів доступне лише до оплати замовлення" }, { status: 409 });
  }

  const rate = await getUahRate();
  const discountPercent = await resolveOrderDiscountPercent(order);
  const { priceBase, price } = computeItemPricing(productRow.price, rate, discountPercent);

  // Manager-added item (as opposed to the customer's own checkout
  // submission) — flagged so the process route can tell items actually
  // changed and pick the right "please review the updated order" email
  // copy instead of the default "availability confirmed" one.
  const { data: item, error } = await supabaseServer
    .from("orders_item")
    .insert({ oid: orderId, product, price, price_base: priceBase, quantity, added_by_admin: true })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(item);
}
