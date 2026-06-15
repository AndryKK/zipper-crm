import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { auth } from "@/lib/auth";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { chars, lang } = await req.json();

  await supabaseServer.from("products_chars").delete().eq("pid", parseInt(id)).eq("lang", lang);

  if (chars?.length) {
    await supabaseServer.from("products_chars").insert(
      chars.map((c: { title: string; value: string }, i: number) => ({
        pid: parseInt(id),
        title: c.title,
        value: c.value,
        lang,
        priority: i,
      }))
    );
  }

  return NextResponse.json({ success: true });
}
