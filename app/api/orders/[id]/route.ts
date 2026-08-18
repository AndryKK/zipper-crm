import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { auth } from "@/lib/auth";
import { resolveLegacyReturns } from "@/lib/returns-resolve";
import { revalidateTag } from "next/cache";
import { resolveStorefrontGroups, buildStorefrontProductPath } from "@/lib/products";

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

  // Products are stored per-language with each language row having its own
  // id, and orders_item.product is that exact row id — match by id alone
  // (no lang filter), same fix as the invoice/waybill product resolution.
  const productIds = [...new Set((items ?? []).map((i) => i.product))];
  const { data: products } = productIds.length
    ? await supabaseServer.from("products").select("id, title, img, pcode, uri, active, lang, translation_id").in("id", productIds)
    : { data: [] };
  const prodMap = new Map((products ?? []).map((p) => [p.id, p]));

  // The product URL must use the "uk" row of the ordered product's
  // translation group, not necessarily the row orders_item.product points
  // at (orders can be placed against either language's id) — see
  // resolveStorefrontGroups in lib/products.ts for the actual lookup.
  const groupIds = (products ?? []).map((p) => p.translation_id);
  const { ukRowByGroupId, mainUkUriByGroupId } = await resolveStorefrontGroups(groupIds);

  const itemsWithProduct = (items ?? []).map((item) => {
    const prod = prodMap.get(item.product);
    const path = prod ? buildStorefrontProductPath(prod.translation_id, ukRowByGroupId, mainUkUriByGroupId, prod.uri) : null;
    return {
      ...item,
      productTitle: prod?.title ?? null,
      productImg: prod?.img ?? null,
      productPcode: prod?.pcode ?? null,
      productUrl: path ? `${process.env.MAIN_DOMAIN}${path}` : null,
    };
  });

  return NextResponse.json({ ...order, items: itemsWithProduct, returns: resolvedReturns });
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
