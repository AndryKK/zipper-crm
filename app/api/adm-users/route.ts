import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { auth } from "@/lib/auth";
import bcrypt from "bcryptjs";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data } = await supabaseServer.from("adm_users").select("id, login, status");
  return NextResponse.json(data || []);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { login, password } = await req.json();
  if (!login || !password) return NextResponse.json({ error: "Логін та пароль обов'язкові" }, { status: 400 });
  const { data: existing } = await supabaseServer.from("adm_users").select("id").eq("login", login).single();
  if (existing) return NextResponse.json({ error: "Логін вже зайнятий" }, { status: 409 });
  const pass = await bcrypt.hash(password, 10);
  const { data: user } = await supabaseServer.from("adm_users").insert({ login, pass }).select("id, login, status").single();
  return NextResponse.json(user, { status: 201 });
}
