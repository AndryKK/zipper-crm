import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { auth } from "@/lib/auth";

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
  const [{ data: categories }, { data: photos }, { data: photos2 }, { data: chars }] = await Promise.all([
    supabaseServer.from("products_categories").select("*").eq("pid", pid),
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
  const body = await req.json();
  const { categoryIds, filterIds, ...data } = body;

  const { data: product } = await supabaseServer
    .from("products")
    .update(data)
    .eq("id", parseInt(id))
    .select("*")
    .single();

  if (categoryIds !== undefined && product) {
    await supabaseServer.from("products_categories").delete().eq("pid", (product as any).id);
    if (categoryIds.length) {
      await supabaseServer.from("products_categories").upsert(
        categoryIds.map((cid: number) => ({ pid: (product as any).id, cid })),
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
  await supabaseServer.from("products").delete().eq("id", parseInt(id));
  return NextResponse.json({ success: true });
}
