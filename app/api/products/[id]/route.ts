import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { auth } from "@/lib/auth";
import { unlinkProductColors, setMainColor } from "@/lib/products";

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { data: product } = await supabaseServer
    .from("products")
    .select("*, labelAction:label_action, translationId:translation_id, seoTitle:seo_title, seoKey:seo_key, seoDescr:seo_descr")
    .eq("id", parseInt(id))
    .single();

  if (!product) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const pid = parseInt(id);
  const trId = (product as any).translation_id ?? pid;
  const [{ data: categories }, { data: photos }, { data: photos2 }, { data: chars }] = await Promise.all([
    // Categories are keyed by translation_id (see the PUT handler below and
    // the storefront's catalog filter) — read them back the same way.
    supabaseServer.from("products_categories").select("*").eq("pid", trId),
    supabaseServer.from("products_photos").select("*").eq("pid", pid).order("priority", { ascending: true }),
    supabaseServer.from("products_photos2").select("*").eq("pid", pid).order("priority", { ascending: true }),
    supabaseServer.from("products_chars").select("*").eq("pid", pid).order("priority", { ascending: true }),
  ]);

  return NextResponse.json({ ...product, categories: categories || [], photos: photos || [], photos2: photos2 || [], chars: chars || [] });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const productId = parseInt(id);
  const body = await req.json();
  const { categoryIds, filterIds, ...data } = body;

  const { data: product } = await supabaseServer
    .from("products")
    .update(data)
    .eq("id", productId)
    .select("*")
    .single();

  // A color saved as active=1 must be the ONLY active=1 in its color
  // group — the storefront treats active=1 as "this is the main/
  // searchable color" (see docs/product-colors.md); two active=1 rows in
  // one group makes the site show them as two separate products instead
  // of one with a color picker. setMainColor sweeps the rest of the group
  // down to active=0, and makes sure BOTH language rows of this color end
  // up active=1 (the .update(data) above only touched the one row `id`
  // points at).
  if (Number(data.active) === 1 && product) {
    await setMainColor(productId);
  }

  if (categoryIds !== undefined && product) {
    // products_categories.pid must be the shared translation_id, NOT this
    // language row's own id. The storefront's catalog filter matches
    // `products.translationId IN (SELECT pid FROM products_categories ...)`
    // (reference/.../catalog.php) — a row keyed by a per-language id
    // never matches there, so the product silently drops out of its
    // category on the live site even though the CRM checkbox stays
    // ticked (it read the row back by the same wrong key). One row per
    // (translation_id, cid) covers both language versions, same as every
    // correctly-imported product in the catalog. FK products_categories
    // .pid -> products(id) is satisfied because the first-created
    // language row's id always equals the translation_id.
    const trId = (product as any).translation_id;
    await supabaseServer.from("products_categories").delete().eq("pid", trId);
    if (categoryIds.length) {
      await supabaseServer.from("products_categories").upsert(
        categoryIds.map((cid: number) => ({ pid: trId, cid })),
        { onConflict: "pid,cid", ignoreDuplicates: true }
      );
    }
  }

  return NextResponse.json(product);
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const productId = parseInt(id);
  // Must run before the delete below — see unlinkProductColors's doc
  // comment (this was the actual bug: a deleted product kept showing up
  // as a color of its group because nothing ever cleaned this up).
  await unlinkProductColors([productId]);
  await supabaseServer.from("products").delete().eq("id", productId);
  return NextResponse.json({ success: true });
}
