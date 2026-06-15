import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { auth } from "@/lib/auth";

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const { data: item } = await supabaseServer
    .from("categories")
    .select("*, translation_id:translationId, seo_title:seoTitle, seo_key:seoKey, seo_descr:seoDescr")
    .eq("id", parseInt(id))
    .single();
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(item);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json();
  const { data: item } = await supabaseServer
    .from("categories")
    .update(body)
    .eq("id", parseInt(id))
    .select("*, translation_id:translationId, seo_title:seoTitle, seo_key:seoKey, seo_descr:seoDescr")
    .single();
  return NextResponse.json(item);
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  await supabaseServer.from("categories").delete().eq("id", parseInt(id));
  return NextResponse.json({ success: true });
}
