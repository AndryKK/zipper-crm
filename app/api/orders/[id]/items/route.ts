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
  const price    = parseFloat(body.price);
  const quantity = parseInt(body.quantity);

  if (!Number.isFinite(product) || !Number.isFinite(price) || !Number.isFinite(quantity) || quantity < 1) {
    return NextResponse.json({ error: "Некоректні дані товару" }, { status: 400 });
  }

  const { data: item, error } = await supabaseServer
    .from("orders_item")
    .insert({ oid: orderId, product, price, quantity })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(item);
}
