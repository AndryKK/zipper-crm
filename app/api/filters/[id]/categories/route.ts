import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { auth } from "@/lib/auth";

// all_filters_items links filter groups to categories where they should be
// shown on the storefront. Both fid and cid reference translation_id, not
// the serial id — confirmed against the live site's catalog.php query.
async function getGroupTranslationId(id: string) {
  const { data: group } = await supabaseServer
    .from("all_filters")
    .select("translation_id")
    .eq("id", parseInt(id))
    .single();
  return (group as any)?.translation_id as number | undefined;
}

// GET /api/filters/[id]/categories
// Returns { categoryIds } — translation_id values of categories this filter
// group is assigned to show in.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const translationId = await getGroupTranslationId(id);
  if (translationId === undefined) return NextResponse.json({ error: "Фільтр не знайдено" }, { status: 404 });

  const { data: links } = await supabaseServer
    .from("all_filters_items")
    .select("cid")
    .eq("fid", translationId);

  return NextResponse.json({ categoryIds: [...new Set((links || []).map((l: any) => l.cid))] });
}

// PUT /api/filters/[id]/categories
// Body: { categoryIds: number[] } — translation_id values of categories.
// Replaces the full set of category assignments for this filter group.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { categoryIds } = await req.json();
  const translationId = await getGroupTranslationId(id);
  if (translationId === undefined) return NextResponse.json({ error: "Фільтр не знайдено" }, { status: 404 });

  await supabaseServer.from("all_filters_items").delete().eq("fid", translationId);

  if (Array.isArray(categoryIds) && categoryIds.length) {
    await supabaseServer.from("all_filters_items").insert(
      categoryIds.map((cid: number) => ({ fid: translationId, cid }))
    );
  }

  return NextResponse.json({ success: true });
}
