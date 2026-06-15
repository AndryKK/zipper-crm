import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { auth } from "@/lib/auth";

const BUCKET = "uploads";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const formData = await req.formData();
  const file = formData.get("img") as File | null;
  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

  await supabaseServer.storage.createBucket(BUCKET, { public: true }).catch(() => {});

  const ext = file.name.split(".").pop() ?? "jpg";
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const storagePath = `categories/${filename}`;

  const bytes = await file.arrayBuffer();
  const { error } = await supabaseServer.storage
    .from(BUCKET)
    .upload(storagePath, bytes, { contentType: file.type || "image/jpeg", upsert: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: { publicUrl } } = supabaseServer.storage.from(BUCKET).getPublicUrl(storagePath);

  const { data: updated } = await supabaseServer
    .from("categories")
    .update({ img: publicUrl })
    .eq("id", parseInt(id))
    .select("img")
    .single();

  return NextResponse.json({ img: (updated as any)?.img });
}
