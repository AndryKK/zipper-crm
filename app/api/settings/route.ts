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

  // Fetch which keys already exist so we can UPDATE vs INSERT
  const { data: existing } = await supabaseServer
    .from("settings")
    .select("value, lang")
    .in("value", updates.map((u) => u.value));

  const existingSet = new Set((existing ?? []).map((s) => `${s.value}__${s.lang}`));

  const toUpdate = updates.filter((u) => existingSet.has(`${u.value}__${u.lang}`));
  const toInsert = updates.filter((u) => !existingSet.has(`${u.value}__${u.lang}`) && u.text !== "");

  const errors: string[] = [];

  await Promise.all([
    ...toUpdate.map((u) =>
      supabaseServer
        .from("settings")
        .update({ text: u.text })
        .eq("value", u.value)
        .eq("lang", u.lang)
        .then(({ error }) => { if (error) errors.push(error.message); })
    ),
    toInsert.length
      ? supabaseServer
          .from("settings")
          .insert(toInsert)
          .then(({ error }) => { if (error) errors.push(error.message); })
      : Promise.resolve(),
  ]);

  if (errors.length) {
    console.error("[settings PUT]", errors);
    return NextResponse.json({ error: errors.join("; ") }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
