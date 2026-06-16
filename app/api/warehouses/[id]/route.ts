import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data, error } = await supabaseServer
    .from("warehouses")
    .select("*")
    .eq("id", Number(id))
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json(data);
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const { title, address, priority, active } = body;
  if (!title?.trim()) return NextResponse.json({ error: "Назва обов'язкова" }, { status: 400 });

  const { data, error } = await supabaseServer
    .from("warehouses")
    .update({ title: title.trim(), address: address || null, priority: priority ?? 0, active: active ?? 1 })
    .eq("id", Number(id))
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await supabaseServer.from("warehouses").delete().eq("id", Number(id));
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
