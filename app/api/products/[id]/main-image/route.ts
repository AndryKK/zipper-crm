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
  if (!file) return NextResponse.json({ error: "Файл не передано" }, { status: 400 });

  const bytes = await file.arrayBuffer();
  const safeName = file.name.replace(/[^a-z0-9.]/gi, "_");
  const key = `products/${Date.now()}-${Math.random().toString(36).slice(2)}-${safeName}`;

  const imgValue = await uploadToR2(key, bytes, file.type || "image/jpeg");

  await supabaseServer.from("products").update({ img: imgValue }).eq("translation_id", trId);

  return NextResponse.json({ img: imgValue });
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
    .update({ img: "" })
    .eq("translation_id", (prod as any).translation_id);

  return NextResponse.json({ success: true });
}
