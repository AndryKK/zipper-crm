import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { auth } from "@/lib/auth";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data } = await supabaseServer.from("custom_strings").select("*").eq("lang", "uk").order("value", { ascending: true });
  return NextResponse.json(data || []);
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json() as { value: string; text: string; lang: string }[];
  await Promise.all(
    body.map((item) =>
      supabaseServer.from("custom_strings").update({ text: item.text }).eq("value", item.value).eq("lang", item.lang)
    )
  );
  return NextResponse.json({ success: true });
}
