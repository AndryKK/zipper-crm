import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { auth } from "@/lib/auth";
import { uploadToR2 } from "@/lib/r2";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const productId = parseInt(id);
  const formData = await req.formData();
  const files = formData.getAll("files") as File[];
  const gallery = formData.get("gallery") === "2";

  const folder = gallery ? "products2" : "products";
  const table  = gallery ? "products_photos2" : "products_photos";

  /* Fetch the product to get lang and translation_id for the insert */
  const { data: prod } = await supabaseServer
    .from("products")
    .select("id, lang, translation_id")
    .eq("id", productId)
    .single();

  if (!prod) return NextResponse.json({ error: "Товар не знайдено" }, { status: 404 });

  const created = [];

  for (const file of files) {
    const bytes = await file.arrayBuffer();
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}-${file.name.replace(/[^a-z0-9.]/gi, "_")}`;
    const key = `${folder}/${filename}`;

    const publicUrl = await uploadToR2(key, bytes, file.type || "image/jpeg");

    const { data: photo, error: insertError } = await supabaseServer
      .from(table)
      .insert({
        pid: productId,
        img: publicUrl,
        lang: (prod as any).lang ?? "uk",
        translation_id: (prod as any).translation_id ?? productId,
        title: "",
        priority: 20,
      })
      .select("*")
      .single();

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

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
