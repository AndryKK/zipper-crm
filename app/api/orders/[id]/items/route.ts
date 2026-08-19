import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { auth } from "@/lib/auth";

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

  // Price is always recomputed server-side from products.price (stored in
  // raw USD-equivalent, same as the legacy storefront) × the грн currency
  // rate — never trusted from the client. A client-sent price is exactly
  // how the CRM used to insert the unconverted USD figure straight into
  // orders_item.price (e.g. 0.095 instead of 5.70 грн for a product whose
  // real site price is products.price * rate).
  const { data: productRow } = await supabaseServer
    .from("products")
    .select("price")
    .eq("id", product)
    .single();
  if (!productRow) return NextResponse.json({ error: "Товар не знайдено" }, { status: 404 });

  const { data: currencyRow } = await supabaseServer
    .from("currency")
    .select("rate")
    .eq("title", "грн")
    .eq("enabled", 1)
    .limit(1)
    .maybeSingle();
  const rate = currencyRow?.rate ?? 1;
  const price = Math.round(productRow.price * rate * 100) / 100;

  const { data: item, error } = await supabaseServer
    .from("orders_item")
    .insert({ oid: orderId, product, price, quantity })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(item);
}
