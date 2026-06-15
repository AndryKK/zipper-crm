import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { auth } from "@/lib/auth";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json();
  const { data: item } = await supabaseServer.from("users_categories").select("translation_id").eq("id", parseInt(id)).single();
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await supabaseServer
    .from("users_categories")
    .update({ discount: body.discount, discount_total: body.discount_total, priority: body.priority })
    .eq("translation_id", (item as any).translation_id);
  const { data: updated } = await supabaseServer
    .from("users_categories")
    .update({ title: body.title })
    .eq("id", parseInt(id))
    .select("*")
    .single();
  return NextResponse.json(updated);
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const { data: item } = await supabaseServer.from("users_categories").select("translation_id").eq("id", parseInt(id)).single();
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await supabaseServer.from("users_categories").delete().eq("translation_id", (item as any).translation_id);
  return NextResponse.json({ success: true });
}
