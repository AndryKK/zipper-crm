import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { auth } from "@/lib/auth";
import { resolveLegacyReturns } from "@/lib/returns-resolve";

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
    ? await supabaseServer.from("products").select("id, title, img, pcode").in("id", productIds)
    : { data: [] };
  const prodMap = new Map((products ?? []).map((p) => [p.id, p]));
  const itemsWithProduct = (items ?? []).map((item) => ({
    ...item,
    productTitle: prodMap.get(item.product)?.title ?? null,
    productImg: prodMap.get(item.product)?.img ?? null,
    productPcode: prodMap.get(item.product)?.pcode ?? null,
  }));

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
  return NextResponse.json(order);
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  await supabaseServer.from("orders").delete().eq("id", parseInt(id));
  return NextResponse.json({ success: true });
}
