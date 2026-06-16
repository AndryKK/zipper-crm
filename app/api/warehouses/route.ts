import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";

export async function GET() {
  const { data, error } = await supabaseServer
    .from("warehouses")
    .select("*")
    .order("priority", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const body = await req.json();
  const { title, address, priority, active } = body;
  if (!title?.trim()) return NextResponse.json({ error: "Назва обов'язкова" }, { status: 400 });

  const { data, error } = await supabaseServer
    .from("warehouses")
    .insert({ title: title.trim(), address: address || null, priority: priority ?? 0, active: active ?? 1 })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
