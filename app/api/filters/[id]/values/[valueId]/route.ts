import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { auth } from "@/lib/auth";

// { title, titleRu } for the rename popup — see the matching GET on
// app/api/filters/[id]/route.ts for why this is needed.
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string; valueId: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { valueId } = await params;
  const { data: row } = await supabaseServer.from("all_filters_filters").select("translation_id, title").eq("id", parseInt(valueId)).maybeSingle();
  if (!row) return NextResponse.json({ error: "Значення не знайдено" }, { status: 404 });
  const { data: ruRow } = await supabaseServer
    .from("all_filters_filters").select("title").eq("translation_id", row.translation_id).eq("lang", "ru").maybeSingle();
  return NextResponse.json({ title: row.title, titleRu: ruRow?.title ?? "" });
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string; valueId: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { valueId } = await params;
  await supabaseServer.from("all_filters_filters").delete().eq("id", parseInt(valueId));
  return NextResponse.json({ success: true });
}

// Renames a filter value. Body: { title: string, titleRu?: string }. Same
// translation_id-propagation reasoning as the filter-group PUT in
// app/api/filters/[id]/route.ts — see that file's own comment.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string; valueId: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { valueId } = await params;
  const body = await req.json();
  const title = (body.title ?? "").trim();
  if (!title) return NextResponse.json({ error: "Назва не може бути порожньою" }, { status: 400 });

  const { data: row } = await supabaseServer.from("all_filters_filters").select("translation_id").eq("id", parseInt(valueId)).maybeSingle();
  if (!row) return NextResponse.json({ error: "Значення не знайдено" }, { status: 404 });

  await supabaseServer.from("all_filters_filters").update({ title }).eq("translation_id", row.translation_id).eq("lang", "uk");

  const titleRu = (body.titleRu ?? "").trim();
  if (titleRu) {
    await supabaseServer.from("all_filters_filters").update({ title: titleRu }).eq("translation_id", row.translation_id).eq("lang", "ru");
  }

  const { data: updated } = await supabaseServer.from("all_filters_filters").select("*").eq("id", parseInt(valueId)).maybeSingle();
  return NextResponse.json(updated);
}
