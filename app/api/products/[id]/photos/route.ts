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
  // Cropped 300x300 thumbnails from ImageCropModal, one per file in `files`
  // at the same index (client always pairs them 1:1 — see PhotosSection's
  // upload() in product-form.tsx). Falls back to using the original as its
  // own thumbnail if a particular index wasn't sent.
  const thumbs = formData.getAll("thumbs") as File[];
  const gallery = formData.get("gallery") === "2";

  const folder = gallery ? "products2" : "products";
  const table  = gallery ? "products_photos2" : "products_photos";

  /* products_photos.pid is a translation_id reference (shared across a
     product's language rows), not the row's own serial id — every reader
     (legacy PHP site, new-shop) queries it that way. Every physical photo
     needs one row PER LANGUAGE VARIANT (ru + uk) — each storefront reads
     only its own lang's row — so fetch every lang this product family has,
     not just whichever single one the admin happens to be viewing. */
  const { data: prod } = await supabaseServer
    .from("products")
    .select("id, translation_id")
    .eq("id", productId)
    .single();

  if (!prod) return NextResponse.json({ error: "Товар не знайдено" }, { status: 404 });

  const trId = (prod as any).translation_id ?? productId;
  const { data: langRows } = await supabaseServer
    .from("products")
    .select("lang")
    .eq("translation_id", trId);
  const langs = [...new Set((langRows ?? []).map((r: any) => r.lang))];

  const created = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const thumb = thumbs[i] as File | undefined;
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}-${file.name.replace(/[^a-z0-9.]/gi, "_")}`;

    const fullBytes = await file.arrayBuffer();
    const fullUrl = await uploadToR2(`${folder}/full/${filename}`, fullBytes, file.type || "image/jpeg");

    let thumbUrl = fullUrl;
    if (thumb) {
      const thumbBytes = await thumb.arrayBuffer();
      thumbUrl = await uploadToR2(`${folder}/${filename}`, thumbBytes, thumb.type || "image/webp");
    }

    const { data: rows, error: insertError } = await supabaseServer
      .from(table)
      .insert(
        langs.map((lang) => ({
          pid: trId,
          img: thumbUrl,
          img_full: fullUrl,
          lang,
          translation_id: trId,
          title: "",
          priority: 20,
        }))
      )
      .select("*");

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    created.push(...(rows ?? []));
  }

  return NextResponse.json(created);
}

export async function DELETE(req: NextRequest, _: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { gallery } = body;
  // photoIds: every lang-row id sharing the same physical photo (see
  // dedupeByImg in app/(admin)/products/[id]/page.tsx) — delete them all
  // together so the photo actually disappears from both ru and uk, not
  // just whichever single row happened to be clicked.
  const photoIds: number[] = body.photoIds ?? (body.photoId ? [body.photoId] : []);
  if (photoIds.length === 0) return NextResponse.json({ error: "photoIds обов'язковий" }, { status: 400 });

  const table = gallery ? "products_photos2" : "products_photos";
  await supabaseServer.from(table).delete().in("id", photoIds);

  return NextResponse.json({ success: true });
}
