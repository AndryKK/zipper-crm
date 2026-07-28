import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { auth } from "@/lib/auth";
import { uploadToR2 } from "@/lib/r2";

// POST — завантажити нове головне фото, оновити products.img для всіх мовних варіантів
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const productId = parseInt(id);

  const { data: prod } = await supabaseServer
    .from("products")
    .select("translation_id")
    .eq("id", productId)
    .single();
  if (!prod) return NextResponse.json({ error: "Товар не знайдено" }, { status: 404 });

  const trId = (prod as any).translation_id;

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  // Cropped 300x300 thumbnail from ImageCropModal — the card/catalog/cart
  // image everywhere on the storefront. `file` itself is kept untouched as
  // img_full (full-size original) — mirrors the layout every already-
  // imported product uses: main directory for the thumb, `full/` for the
  // original, same filename in both.
  const thumb = formData.get("thumb") as File | null;
  if (!file) return NextResponse.json({ error: "Файл не передано" }, { status: 400 });

  const safeName = file.name.replace(/[^a-z0-9.]/gi, "_");
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}-${safeName}`;

  const fullBytes = await file.arrayBuffer();
  const fullUrl = await uploadToR2(`products/full/${filename}`, fullBytes, file.type || "image/jpeg");

  let thumbUrl = fullUrl;
  if (thumb) {
    const thumbBytes = await thumb.arrayBuffer();
    thumbUrl = await uploadToR2(`products/${filename}`, thumbBytes, thumb.type || "image/webp");
  }

  await supabaseServer.from("products").update({ img: thumbUrl, img_full: fullUrl }).eq("translation_id", trId);

  return NextResponse.json({ img: thumbUrl, img_full: fullUrl });
}

// DELETE — очистити головне фото для всіх мовних варіантів
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const productId = parseInt(id);

  const { data: prod } = await supabaseServer
    .from("products")
    .select("translation_id")
    .eq("id", productId)
    .single();
  if (!prod) return NextResponse.json({ error: "Товар не знайдено" }, { status: 404 });

  await supabaseServer
    .from("products")
    .update({ img: "", img_full: "" })
    .eq("translation_id", (prod as any).translation_id);

  return NextResponse.json({ success: true });
}
