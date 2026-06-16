import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { auth } from "@/lib/auth";
import { uploadToR2 } from "@/lib/r2";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const formData = await req.formData();
  const file = formData.get("img") as File | null;
  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

  const ext = file.name.split(".").pop() ?? "jpg";
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const key = `categories/${filename}`;

  const bytes = await file.arrayBuffer();
  const publicUrl = await uploadToR2(key, bytes, file.type || "image/jpeg");

  const { data: updated } = await supabaseServer
    .from("categories")
    .update({ img: publicUrl })
    .eq("id", parseInt(id))
    .select("img")
    .single();

  return NextResponse.json({ img: (updated as any)?.img });
}
