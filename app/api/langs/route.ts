import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { auth } from "@/lib/auth";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data } = await supabaseServer.from("langs").select("*").order("priority", { ascending: true });
  return NextResponse.json(data || []);
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json() as { id: number; active: number; visibility: number }[];
  await Promise.all(
    body.map((l) => supabaseServer.from("langs").update({ active: l.active, visibility: l.visibility }).eq("id", l.id))
  );
  return NextResponse.json({ success: true });
}
