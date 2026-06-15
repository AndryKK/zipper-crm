import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { auth } from "@/lib/auth";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data } = await supabaseServer.from("settings").select("*").eq("lang", "uk").order("value", { ascending: true });
  return NextResponse.json(data || []);
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const updates: { value: string; text: string; lang: string }[] = await req.json();

  await Promise.all(updates.map((u) =>
    supabaseServer.from("settings").upsert(
      { value: u.value, text: u.text, lang: u.lang },
      { onConflict: "value,lang", ignoreDuplicates: false }
    )
  ));

  return NextResponse.json({ success: true });
}
