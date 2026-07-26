import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { auth } from "@/lib/auth";

// Category-side of the same all_filters_items link that
// /api/filters/[id]/categories manages from the filter-group side. Both fid
// (filter group) and cid (category) reference translation_id, not the
// serial id — confirmed against the live site's catalog.php query.
async function getCategoryTranslationId(id: string) {
  const { data: category } = await supabaseServer
    .from("categories")
    .select("translation_id")
    .eq("id", parseInt(id))
    .single();
  return (category as any)?.translation_id as number | undefined;
}

// GET /api/categories/[id]/filters
// Returns { filterIds } — translation_id values of filter groups assigned
// to show on this category.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const translationId = await getCategoryTranslationId(id);
  if (translationId === undefined) return NextResponse.json({ error: "Категорію не знайдено" }, { status: 404 });

  const { data: links } = await supabaseServer
    .from("all_filters_items")
    .select("fid")
    .eq("cid", translationId);

  return NextResponse.json({ filterIds: [...new Set((links || []).map((l: any) => l.fid))] });
}

// PUT /api/categories/[id]/filters
// Body: { filterIds: number[] } — translation_id values of filter groups.
// Replaces the full set of filter-group assignments for this category.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { filterIds } = await req.json();
  const translationId = await getCategoryTranslationId(id);
  if (translationId === undefined) return NextResponse.json({ error: "Категорію не знайдено" }, { status: 404 });

  await supabaseServer.from("all_filters_items").delete().eq("cid", translationId);

  if (Array.isArray(filterIds) && filterIds.length) {
    await supabaseServer.from("all_filters_items").insert(
      filterIds.map((fid: number) => ({ cid: translationId, fid }))
    );
  }

  return NextResponse.json({ success: true });
}
