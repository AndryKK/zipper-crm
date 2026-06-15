import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { auth } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const q = new URL(req.url).searchParams.get("q") ?? "";

  let query = supabaseServer
    .from("users")
    .select("id, login, person, phone, email, rank, status, addr_delivery:addrDelivery")
    .order("id", { ascending: false })
    .limit(100);

  if (q) {
    query = query.or(`login.ilike.%${q}%,person.ilike.%${q}%,phone.ilike.%${q}%`);
  }

  const { data: items } = await query;
  return NextResponse.json(items || []);
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, ...data } = await req.json();
  const { data: item } = await supabaseServer
    .from("users")
    .update(data)
    .eq("id", id)
    .select("id, login, person, phone, email, rank, status, addr_delivery:addrDelivery")
    .single();
  return NextResponse.json(item);
}
