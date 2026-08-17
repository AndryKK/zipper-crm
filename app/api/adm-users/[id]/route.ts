import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { auth } from "@/lib/auth";
import bcrypt from "bcryptjs";
import { ROLES, PROTECTED_LOGIN } from "@/lib/roles";

async function requireSuperadmin() {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (!session) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (role !== ROLES.SUPERADMIN) return { error: NextResponse.json({ error: "Доступ лише для суперадмінів" }, { status: 403 }) };
  return { session };
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await requireSuperadmin();
  if (error) return error;
  const { id } = await params;
  const targetId = parseInt(id);
  const { password, role } = await req.json();

  const data: Record<string, unknown> = {};
  if (password) data.pass = await bcrypt.hash(password, 10);

  if (role !== undefined) {
    if (!Object.values(ROLES).includes(role)) return NextResponse.json({ error: "Невірна роль" }, { status: 400 });
    // A superadmin may change anyone's role except their own (so nobody
    // can accidentally strip their own access) and except avian's (the
    // always-superadmin fallback account — see lib/roles.ts).
    if (String(session!.user!.id) === String(targetId)) {
      return NextResponse.json({ error: "Не можна змінити свою власну роль" }, { status: 403 });
    }
    const { data: target } = await supabaseServer.from("adm_users").select("login").eq("id", targetId).single();
    if (target?.login === PROTECTED_LOGIN) {
      return NextResponse.json({ error: `Не можна змінити роль ${PROTECTED_LOGIN}` }, { status: 403 });
    }
    data.role = role;
  }

  await supabaseServer.from("adm_users").update(data).eq("id", targetId);
  return NextResponse.json({ success: true });
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await requireSuperadmin();
  if (error) return error;
  const { id } = await params;
  const targetId = parseInt(id);

  if (String(session!.user!.id) === String(targetId)) {
    return NextResponse.json({ error: "Не можна видалити свій власний обліковий запис" }, { status: 403 });
  }
  const { data: target } = await supabaseServer.from("adm_users").select("login").eq("id", targetId).single();
  if (target?.login === PROTECTED_LOGIN) {
    return NextResponse.json({ error: `Не можна видалити ${PROTECTED_LOGIN}` }, { status: 403 });
  }

  await supabaseServer.from("adm_users").delete().eq("id", targetId);
  return NextResponse.json({ success: true });
}
