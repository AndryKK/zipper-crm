import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { auth } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const q = searchParams.get("q") ?? "";
  const page = parseInt(searchParams.get("page") ?? "1");
  const limit = 30;

  let query = supabaseServer
    .from("orders")
    .select("*, addrDelivery:addr_delivery, items:orders_item(*)", { count: "exact" })
    .order("date", { ascending: false })
    .range((page - 1) * limit, page * limit - 1);

  if (status) query = query.eq("status", status);
  if (q) query = query.or(`person.ilike.%${q}%,phone.ilike.%${q}%,login.ilike.%${q}%`);

  const { data: items, count } = await query;
  return NextResponse.json({ items: items || [], total: count ?? 0 });
}
