import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { auth } from "@/lib/auth";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data } = await supabaseServer.from("currency").select("*").order("id", { ascending: true });
  return NextResponse.json(data || []);
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json() as { id: number; rate: number; enabled: number }[];
  await Promise.all(
    body.map((c) => supabaseServer.from("currency").update({ rate: c.rate, enabled: c.enabled }).eq("id", c.id))
  );
  return NextResponse.json({ success: true });
}
