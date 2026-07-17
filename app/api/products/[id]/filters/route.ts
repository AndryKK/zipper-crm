import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { auth } from "@/lib/auth";

// GET /api/products/[id]/filters
// Returns { filterIds } — translation_id values of all_filters_filters (filter
// values) currently assigned to this product via all_filters_filters_items.
// Keyed by translation_id (not the row id) because that's what the
// customer-facing site (catalog.php) joins on, and because multi-language
// filter-value rows share one translation_id across separate ids.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { data: product } = await supabaseServer
    .from("products")
    .select("translation_id")
    .eq("id", parseInt(id))
    .single();
  if (!product) return NextResponse.json({ error: "Товар не знайдено" }, { status: 404 });

  const { data: links } = await supabaseServer
    .from("all_filters_filters_items")
    .select("fid")
    .eq("pid", (product as any).translation_id);

  return NextResponse.json({ filterIds: (links || []).map((l: any) => l.fid) });
}

// PUT /api/products/[id]/filters
// Body: { filterIds: number[] } — translation_id values of selected filter values.
// Replaces the full set of filter-value assignments for this product
// (same translation_id → shared across all language variants of it).
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { filterIds } = await req.json();

  const { data: product } = await supabaseServer
    .from("products")
    .select("translation_id")
    .eq("id", parseInt(id))
    .single();
  if (!product) return NextResponse.json({ error: "Товар не знайдено" }, { status: 404 });

  const translationId = (product as any).translation_id;

  await supabaseServer.from("all_filters_filters_items").delete().eq("pid", translationId);

  if (Array.isArray(filterIds) && filterIds.length) {
    await supabaseServer.from("all_filters_filters_items").insert(
      filterIds.map((fid: number) => ({ pid: translationId, fid }))
    );
  }

  return NextResponse.json({ success: true });
}
