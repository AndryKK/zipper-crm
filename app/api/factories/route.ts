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

// GET is readable by any role that can reach /inventory (superadmin +
// inventory_admin — see lib/roles.ts) since assigning a product's factory
// for the first time needs the options list. Managing the list itself
// (POST here, PUT/DELETE in [id]/route.ts) stays superadmin-only.
export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data, error } = await supabaseServer.from("factories").select("id, title").order("title");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || []);
}

export async function POST(req: NextRequest) {
  const { error } = await requireSuperadmin();
  if (error) return error;
  const { title } = await req.json();
  if (!title?.trim()) return NextResponse.json({ error: "Назва обов'язкова" }, { status: 400 });
  const { data, error: insErr } = await supabaseServer
    .from("factories")
    .insert({ title: title.trim() })
    .select("id, title")
    .single();
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
