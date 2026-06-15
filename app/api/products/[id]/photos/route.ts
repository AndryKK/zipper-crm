import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { auth } from "@/lib/auth";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const productId = parseInt(id);
  const formData = await req.formData();
  const files = formData.getAll("files") as File[];
  const gallery = formData.get("gallery") === "2";

  const uploadDir = path.join(process.cwd(), "public", "img", "upload-files", "products");
  await mkdir(uploadDir, { recursive: true });

  const created = [];
  for (const file of files) {
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const filename = `${Date.now()}-${file.name.replace(/[^a-z0-9.]/gi, "_")}`;
    await writeFile(path.join(uploadDir, filename), buffer);

    const table = gallery ? "products_photos2" : "products_photos";
    const { data: photo } = await supabaseServer.from(table).insert({ pid: productId, img: filename }).select("*").single();
    created.push(photo);
  }

  return NextResponse.json(created);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { photoId, gallery } = await req.json();

  const table = gallery ? "products_photos2" : "products_photos";
  await supabaseServer.from(table).delete().eq("id", photoId);

  return NextResponse.json({ success: true });
}
