import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { auth } from "@/lib/auth";
import { transliterate } from "@/lib/utils";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get("page") ?? "1");
  const q = searchParams.get("q") ?? "";
  const limit = 20;

  let query = supabaseServer.from("news").select("*", { count: "exact" }).eq("lang", "uk");
  if (q) query = query.ilike("title", `%${q}%`);
  const { data: items, count } = await query
    .order("priority", { ascending: true })
    .range((page - 1) * limit, page * limit - 1);

  const total = count ?? 0;
  return NextResponse.json({ items: items || [], total, pages: Math.ceil(total / limit) });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();

  const { data: maxTransRow } = await supabaseServer
    .from("news")
    .select("translation_id")
    .order("translation_id", { ascending: false })
    .limit(1)
    .single();
  const translationId = ((maxTransRow as any)?.translation_id ?? 0) + 1;

  const { data: langs } = await supabaseServer.from("langs").select("*").eq("active", 1);
  const activeLangs = langs || [];

  const { data: maxPriorityRow } = await supabaseServer
    .from("news")
    .select("priority")
    .order("priority", { ascending: false })
    .limit(1)
    .single();
  const priority = ((maxPriorityRow as any)?.priority ?? 0) + 1;

  const items = await Promise.all(activeLangs.map(async (l: any) => {
    const { data } = await supabaseServer.from("news").insert({
      translation_id: translationId,
      lang: l.code,
      title: body.title,
      uri: body.uri || transliterate(body.title),
      descr: body.descr ?? null,
      text: body.text ?? null,
      img: body.img ?? null,
      priority,
      data: body.data ? new Date(body.data).toISOString() : new Date().toISOString(),
    }).select("*").single();
    return data;
  }));

  return NextResponse.json(items.find((i: any) => i?.lang === "uk") ?? items[0], { status: 201 });
}
