import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { auth } from "@/lib/auth";
import { RETURN_STATUS } from "@/lib/returns";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { data: returns } = await supabaseServer
    .from("orders_returns")
    .select("*")
    .eq("oid", parseInt(id))
    .order("date", { ascending: false });

  return NextResponse.json(returns ?? []);
}

// Creates a return REQUEST only — does not touch inventory. Stock only comes
// back once the return is marked "Отримано на складі" (see
// PATCH /api/orders/[id]/returns/[returnId]), matching the rule that goods
// aren't back in stock until Nova Poshta actually delivers them there.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const orderId = parseInt(id);
  const body = await req.json();

  const product = parseInt(body.product);
  const qty = parseInt(body.qty);
  const reason: string | null = body.reason?.trim() || null;

  if (!Number.isFinite(product) || !Number.isFinite(qty) || qty < 1) {
    return NextResponse.json({ error: "Некоректні дані повернення" }, { status: 400 });
  }

  const { data: order } = await supabaseServer.from("orders").select("id, login, person, phone").eq("id", orderId).single();
  if (!order) return NextResponse.json({ error: "Замовлення не знайдено" }, { status: 404 });

  const { data: ret, error } = await supabaseServer
    .from("orders_returns")
    .insert({
      oid: orderId,
      product,
      qty,
      reason,
      status: RETURN_STATUS.NEW,
      login: order.login,
      person: order.person,
      phone: order.phone,
      restocked: false,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(ret);
}
