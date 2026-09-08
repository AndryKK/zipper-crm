import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { auth } from "@/lib/auth";

// { title, titleRu } for the rename popup — the main list (GET /api/filters)
// only ever fetches lang=uk rows, so the CRM otherwise has no way to know
// what the sibling ru row's title currently is before overwriting it.
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const { data: row } = await supabaseServer.from("all_filters").select("translation_id, title").eq("id", parseInt(id)).maybeSingle();
  if (!row) return NextResponse.json({ error: "Фільтр не знайдено" }, { status: 404 });
  const { data: ruRow } = await supabaseServer
    .from("all_filters").select("title").eq("translation_id", row.translation_id).eq("lang", "ru").maybeSingle();
  return NextResponse.json({ title: row.title, titleRu: ruRow?.title ?? "" });
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  await supabaseServer.from("all_filters").delete().eq("id", parseInt(id));
  return NextResponse.json({ success: true });
}

// Renames a filter group. Body: { title: string, titleRu?: string }. Like
// the reorder endpoint (app/api/filters/values/reorder/route.ts), writes
// by translation_id rather than the given row's own id — all_filters
// pairs a uk/ru row per group sharing one translation_id (see POST above,
// which creates both at once), and this CRM only ever lists/edits the uk
// row (GET's own .eq("lang","uk")), so renaming only that row would leave
// the ru row's title silently stuck at whatever "[ru] ..." placeholder it
// got on creation — exactly the gap DELETE above still has (only ever
// touches the single row for the given id, orphaning its sibling).
// titleRu is optional so a manager can fix just the uk name without being
// forced to also translate it right now.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json();
  const title = (body.title ?? "").trim();
  if (!title) return NextResponse.json({ error: "Назва не може бути порожньою" }, { status: 400 });

  const { data: row } = await supabaseServer.from("all_filters").select("translation_id").eq("id", parseInt(id)).maybeSingle();
  if (!row) return NextResponse.json({ error: "Фільтр не знайдено" }, { status: 404 });

  await supabaseServer.from("all_filters").update({ title }).eq("translation_id", row.translation_id).eq("lang", "uk");

  const titleRu = (body.titleRu ?? "").trim();
  if (titleRu) {
    await supabaseServer.from("all_filters").update({ title: titleRu }).eq("translation_id", row.translation_id).eq("lang", "ru");
  }

  const { data: updated } = await supabaseServer.from("all_filters").select("*").eq("id", parseInt(id)).maybeSingle();
  return NextResponse.json(updated);
}
