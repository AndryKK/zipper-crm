import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { auth } from "@/lib/auth";
import { resolveLegacyReturns } from "@/lib/returns-resolve";
import { revalidateTag } from "next/cache";
import { resolveStorefrontGroups, buildStorefrontProductPath } from "@/lib/products";
import { getClientDiscountPercent } from "@/lib/pricing";
import { isGuestCheckoutEmail } from "@/lib/guest-checkout";

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const { data: order } = await supabaseServer
    .from("orders")
    .select("*")
    .eq("id", parseInt(id))
    .single();
  if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const [{ data: items }, { data: returns }] = await Promise.all([
    supabaseServer.from("orders_item").select("*").eq("oid", parseInt(id)),
    // Legacy storefront returns aren't linked via `oid` at all — only via the
    // free-text `order` field — so match either, then resolve legacy rows
    // (auto-fills oid/product/qty from order/code/quantity) before returning.
    supabaseServer
      .from("orders_returns")
      .select("*")
      .or(`oid.eq.${parseInt(id)},order.eq.${parseInt(id)}`)
      .order("date", { ascending: false }),
  ]);
  const resolvedReturns = await resolveLegacyReturns(returns ?? []);

  // Account holder's OWN profile — distinct from order.person/phone/
  // addr_delivery, which are this specific order's RECIPIENT (can be a
  // completely different person, e.g. a gift — see recipientPhone's own
  // comment in lib/order-ttn.ts). The order page's "Замовник" card uses
  // this for the person who actually placed the order; null for a login
  // that never became a real account, OR the shared guest-checkout login
  // (see lib/guest-checkout.ts) — that one DOES have a `users` row, but
  // it's the site's own generic technical account (garbage placeholder
  // data like phone="1"), not a real customer's profile.
  const { data: customerUser } = order.login && !isGuestCheckoutEmail(order.login)
    ? await supabaseServer.from("users").select("person, phone, rank, addr_delivery, is_organization, edrpou").eq("login", order.login).maybeSingle()
    : { data: null };
  const { data: customerRank } = customerUser?.rank
    ? await supabaseServer.from("users_categories").select("title, discount").eq("translation_id", customerUser.rank).eq("lang", "uk").maybeSingle()
    : { data: null };
  const customer = customerUser ? {
    person: customerUser.person,
    phone: customerUser.phone,
    addrDelivery: customerUser.addr_delivery,
    isOrganization: customerUser.is_organization,
    edrpou: customerUser.edrpou,
    rankLabel: customerRank?.title ?? null,
    rankDiscount: customerRank?.discount ?? null,
  } : null;

  // The client's own rank-based discount (see lib/pricing.ts) — surfaced
  // separately from order.discount_percent (a manager override, may be
  // null) so the stock-check popup can show/prefill "this client's default
  // is N%" even before any override has ever been set on this order.
  const clientDiscountPercent = await getClientDiscountPercent(order.login);

  // Products are stored per-language with each language row having its own
  // id, and orders_item.product is that exact row id — match by id alone
  // (no lang filter), same fix as the invoice/waybill product resolution.
  const productIds = [...new Set((items ?? []).map((i) => i.product))];
  const { data: products } = productIds.length
    ? await supabaseServer.from("products").select("id, title, img, pcode, uri, active, lang, translation_id").in("id", productIds)
    : { data: [] };
  const prodMap = new Map((products ?? []).map((p) => [p.id, p]));

  // The CRM always shows product names in Ukrainian, regardless of which
  // storefront the order was actually placed on — orders_item.product can
  // point at a "ru" row (an order placed on the ru site), and showing that
  // row's own title verbatim leaked Russian text into the CRM's order item
  // list. Same fix order-documents.ts already applies to invoices/emails:
  // look up each product's "uk" sibling by translation_id and prefer its
  // title/pcode, falling back to the order's own row if no uk row exists.
  const translationIds = [...new Set((products ?? []).map((p) => p.translation_id))];
  const { data: ukProducts } = translationIds.length
    ? await supabaseServer.from("products").select("translation_id, title, pcode").eq("lang", "uk").in("translation_id", translationIds)
    : { data: [] };
  const ukByTranslation = new Map((ukProducts ?? []).map((p) => [p.translation_id, p]));

  // The product URL must use the "uk" row of the ordered product's
  // translation group, not necessarily the row orders_item.product points
  // at (orders can be placed against either language's id) — see
  // resolveStorefrontGroups in lib/products.ts for the actual lookup.
  const groupIds = (products ?? []).map((p) => p.translation_id);
  const { ukRowByGroupId, mainUkUriByGroupId } = await resolveStorefrontGroups(groupIds);

  const itemsWithProduct = (items ?? []).map((item) => {
    const prod = prodMap.get(item.product);
    const uk = prod ? ukByTranslation.get(prod.translation_id) : undefined;
    const path = prod ? buildStorefrontProductPath(prod.translation_id, ukRowByGroupId, mainUkUriByGroupId, prod.uri) : null;
    return {
      ...item,
      productTitle: uk?.title ?? prod?.title ?? null,
      productImg: prod?.img ?? null,
      productPcode: uk?.pcode ?? prod?.pcode ?? null,
      productUrl: path ? `${process.env.MAIN_DOMAIN}${path}` : null,
    };
  });

  return NextResponse.json({ ...order, items: itemsWithProduct, returns: resolvedReturns, clientDiscountPercent, customer });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json();
  const { data: order } = await supabaseServer
    .from("orders")
    .update(body)
    .eq("id", parseInt(id))
    .select("*")
    .single();
  // This is the generic manual-edit save (the status dropdown + "Зберегти"
  // button, and advanceStatus() for "Відправлено"/"Завершено") — unlike
  // process/confirm-payment/ttn/*, it wasn't previously wired to
  // revalidateTag, so a manual status change here left the sidebar's
  // "очікують відправку" badge stuck at the old count until the 120s
  // cache fallback happened to expire.
  if (body.status !== undefined) revalidateTag("sidebar-counts", { expire: 0 });
  return NextResponse.json(order);
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  await supabaseServer.from("orders").delete().eq("id", parseInt(id));
  return NextResponse.json({ success: true });
}
