import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { auth } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const lang = new URL(req.url).searchParams.get("lang") ?? "uk";
  const { data } = await supabaseServer
    .from("articles")
    .select("*, translationId:translation_id, seoTitle:seo_title, seoKey:seo_key, seoDescr:seo_descr")
    .eq("lang", lang)
    .order("priority", { ascending: true })
    .order("data", { ascending: false });
  return NextResponse.json(data || []);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();

  const { data: maxRow } = await supabaseServer
    .from("articles")
    .select("translation_id")
    .order("translation_id", { ascending: false })
    .limit(1)
    .single();
  const translationId = ((maxRow as any)?.translation_id ?? 0) + 1;

  const { data: langs } = await supabaseServer.from("langs").select("*").eq("active", 1);
  const activeLangs = langs || [];

  const items = await Promise.all(activeLangs.map(async (l: any) => {
    const { data } = await supabaseServer.from("articles").insert({
      ...body,
      lang: l.code,
      translation_id: translationId,
      title: l.code === body.lang ? body.title : `[${l.code}] ${body.title}`,
    }).select("*").single();
    return data;
  }));

  return NextResponse.json(items.find((i: any) => i?.lang === body.lang) ?? items[0], { status: 201 });
}
