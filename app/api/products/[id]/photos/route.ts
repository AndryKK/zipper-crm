import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { auth } from "@/lib/auth";

const BUCKET = "uploads";

async function ensureBucket() {
  await supabaseServer.storage.createBucket(BUCKET, { public: true }).catch(() => {});
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const productId = parseInt(id);
  const formData = await req.formData();
  const files = formData.getAll("files") as File[];
  const gallery = formData.get("gallery") === "2";

  await ensureBucket();

  const folder = gallery ? "products2" : "products";
  const table = gallery ? "products_photos2" : "products_photos";
  const created = [];

  for (const file of files) {
    const bytes = await file.arrayBuffer();
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}-${file.name.replace(/[^a-z0-9.]/gi, "_")}`;
    const storagePath = `${folder}/${filename}`;

    const { error } = await supabaseServer.storage
      .from(BUCKET)
      .upload(storagePath, bytes, { contentType: file.type || "image/jpeg", upsert: false });

    if (error) continue;

    const { data: { publicUrl } } = supabaseServer.storage.from(BUCKET).getPublicUrl(storagePath);
    const { data: photo } = await supabaseServer.from(table).insert({ pid: productId, img: publicUrl }).select("*").single();
    created.push(photo);
  }

  return NextResponse.json(created);
}

export async function DELETE(req: NextRequest, _: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { photoId, gallery } = await req.json();
  const table = gallery ? "products_photos2" : "products_photos";
  await supabaseServer.from(table).delete().eq("id", photoId);

  return NextResponse.json({ success: true });
}
