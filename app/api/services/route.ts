import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { auth } from "@/lib/auth";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data } = await supabaseServer.from("services").select("*").eq("lang", "uk").order("priority", { ascending: true });
  return NextResponse.json(data || []);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();

  const { data: maxTransRow } = await supabaseServer
    .from("services")
    .select("translation_id")
    .order("translation_id", { ascending: false })
    .limit(1)
    .single();
  const translationId = ((maxTransRow as any)?.translation_id ?? 0) + 1;

  const { data: langs } = await supabaseServer.from("langs").select("*").eq("active", 1);
  const activeLangs = langs || [];

  const { data: maxPriorityRow } = await supabaseServer
    .from("services")
    .select("priority")
    .order("priority", { ascending: false })
    .limit(1)
    .single();
  const priority = ((maxPriorityRow as any)?.priority ?? 0) + 1;

  const items = await Promise.all(activeLangs.map(async (l: any) => {
    const { data } = await supabaseServer.from("services").insert({
      translation_id: translationId,
      lang: l.code,
      title: body.title,
      descr: body.descr ?? null,
      img: body.img ?? null,
      priority,
    }).select("*").single();
    return data;
  }));

  return NextResponse.json(items.find((i: any) => i?.lang === "uk") ?? items[0], { status: 201 });
}
