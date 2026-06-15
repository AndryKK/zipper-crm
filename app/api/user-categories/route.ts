import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { auth } from "@/lib/auth";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data } = await supabaseServer.from("users_categories").select("*, translationId:translation_id").eq("lang", "uk").order("priority", { ascending: true });
  return NextResponse.json(data || []);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();

  const { data: maxTransRow } = await supabaseServer
    .from("users_categories")
    .select("translation_id")
    .order("translation_id", { ascending: false })
    .limit(1)
    .single();
  const translationId = ((maxTransRow as any)?.translation_id ?? 0) + 1;

  const { data: langs } = await supabaseServer.from("langs").select("*").eq("active", 1);
  const activeLangs = langs || [];

  const items = await Promise.all(activeLangs.map(async (l: any) => {
    const { data } = await supabaseServer.from("users_categories").insert({
      translation_id: translationId,
      lang: l.code,
      title: body.title,
      discount: body.discount ?? 0,
      discount_total: body.discount_total ?? 0,
      priority: body.priority ?? 0,
    }).select("*").single();
    return data;
  }));

  return NextResponse.json(items.find((i: any) => i?.lang === "uk") ?? items[0], { status: 201 });
}
