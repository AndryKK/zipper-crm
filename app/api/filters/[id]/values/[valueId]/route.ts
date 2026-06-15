import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { auth } from "@/lib/auth";

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string; valueId: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { valueId } = await params;
  await supabaseServer.from("all_filters_filters").delete().eq("id", parseInt(valueId));
  return NextResponse.json({ success: true });
}
