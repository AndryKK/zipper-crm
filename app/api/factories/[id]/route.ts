import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { auth } from "@/lib/auth";
import { ROLES } from "@/lib/roles";

async function requireSuperadmin() {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (!session) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (role !== ROLES.SUPERADMIN) return { error: NextResponse.json({ error: "Доступ лише для суперадмінів" }, { status: 403 }) };
  return { session };
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireSuperadmin();
  if (error) return error;
  const { id } = await params;
  const { title } = await req.json();
  if (!title?.trim()) return NextResponse.json({ error: "Назва обов'язкова" }, { status: 400 });
  const { data, error: updErr } = await supabaseServer
    .from("factories")
    .update({ title: title.trim() })
    .eq("id", Number(id))
    .select("id, title")
    .single();
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });
  return NextResponse.json(data);
}

// products.factory_id references this table with ON DELETE SET NULL — a
// deleted factory just leaves those products unassigned again, no manual
// cleanup needed here.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireSuperadmin();
  if (error) return error;
  const { id } = await params;
  const { error: delErr } = await supabaseServer.from("factories").delete().eq("id", Number(id));
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
