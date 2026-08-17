import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { auth } from "@/lib/auth";
import bcrypt from "bcryptjs";
import { ROLES } from "@/lib/roles";

// /adm-users and /api/adm-users are already blocked for non-superadmin
// roles by proxy.ts's isPathAllowed check — this is a defense-in-depth
// re-check directly in the handler, since this route can create/see every
// admin account in the system.
async function requireSuperadmin() {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (!session) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (role !== ROLES.SUPERADMIN) return { error: NextResponse.json({ error: "Доступ лише для суперадмінів" }, { status: 403 }) };
  return { session };
}

export async function GET() {
  const { error } = await requireSuperadmin();
  if (error) return error;
  const { data } = await supabaseServer.from("adm_users").select("id, login, role").order("id");
  return NextResponse.json(data || []);
}

export async function POST(req: NextRequest) {
  const { error } = await requireSuperadmin();
  if (error) return error;
  const { login, password, role } = await req.json();
  if (!login || !password) return NextResponse.json({ error: "Логін та пароль обов'язкові" }, { status: 400 });
  if (!Object.values(ROLES).includes(role)) return NextResponse.json({ error: "Невірна роль" }, { status: 400 });
  const { data: existing } = await supabaseServer.from("adm_users").select("id").eq("login", login).single();
  if (existing) return NextResponse.json({ error: "Логін вже зайнятий" }, { status: 409 });
  const pass = await bcrypt.hash(password, 10);
  const { data: user } = await supabaseServer.from("adm_users").insert({ login, pass, role }).select("id, login, role").single();
  return NextResponse.json(user, { status: 201 });
}
