import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { auth } from "@/lib/auth";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, itemId } = await params;
  const orderId = parseInt(id);
  const body = await req.json();

  const update: { price?: number; quantity?: number } = {};
  if (body.price !== undefined) {
    const price = parseFloat(body.price);
    if (!Number.isFinite(price) || price < 0) return NextResponse.json({ error: "Некоректна ціна" }, { status: 400 });
    update.price = price;
  }
  if (body.quantity !== undefined) {
    const quantity = parseInt(body.quantity);
    if (!Number.isFinite(quantity) || quantity < 1) return NextResponse.json({ error: "Некоректна кількість" }, { status: 400 });
    update.quantity = quantity;
  }

  const { data: item, error } = await supabaseServer
    .from("orders_item")
    .update(update)
    .eq("id", parseInt(itemId))
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
