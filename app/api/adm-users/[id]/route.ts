import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { auth } from "@/lib/auth";
import bcrypt from "bcryptjs";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const { password, status } = await req.json();
  const data: Record<string, unknown> = {};
  if (password) data.pass = await bcrypt.hash(password, 10);
  if (status !== undefined) data.status = status;
  await supabaseServer.from("adm_users").update(data).eq("id", parseInt(id));
  return NextResponse.json({ success: true });
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  await supabaseServer.from("adm_users").delete().eq("id", parseInt(id));
  return NextResponse.json({ success: true });
}
