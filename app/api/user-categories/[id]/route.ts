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

  // discount/discount_total/priority are shared across every language
  // variant of this category (same translation_id), title is per-row —
  // the admin page only ever sends one field at a time, so each step here
  // must be skippable rather than always running with the other fields as
  // undefined: an update() call with every key stripped to undefined still
  // issues an empty-payload PATCH, and chaining .single() on that 406'd
  // ("Cannot coerce the result to a single JSON object") instead of
  // returning the row — silently turning every discount-only/discount_total-
  // only edit's response into `null`, even though the write itself had
  // already gone through.
  const sharedFields: Record<string, unknown> = {};
  if (body.discount !== undefined) sharedFields.discount = body.discount;
  if (body.discount_total !== undefined) sharedFields.discount_total = body.discount_total;
  if (body.priority !== undefined) sharedFields.priority = body.priority;
  if (Object.keys(sharedFields).length > 0) {
    await supabaseServer
      .from("users_categories")
      .update(sharedFields)
      .eq("translation_id", (item as any).translation_id);
  }

  if (body.title !== undefined) {
    await supabaseServer.from("users_categories").update({ title: body.title }).eq("id", parseInt(id));
  }

  const { data: updated } = await supabaseServer
    .from("users_categories")
    .select("*")
    .eq("id", parseInt(id))
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
