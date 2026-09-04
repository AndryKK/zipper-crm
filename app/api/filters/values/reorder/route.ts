import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { auth } from "@/lib/auth";

// PUT /api/filters/values/reorder
// Body: { orderedIds: number[] } — all_filters_filters.id values (the uk
// rows shown in the CRM, in the new order after a drag-and-drop reorder
// on the /filters page). Persists as priority = array index. Written by
// translation_id (not the dragged row's own id) so every language sharing
// that value — the ru row on in.ua, same as the uk row here — ends up
// with the same order; the storefronts' own ORDER BY (catalog.php's
// sidebar filters, sale.php's per-product dropdown) already sort by
// o.priority asc, this is just what feeds it now instead of the single
// equal value every option was reset to on 2026-09-04.
export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { orderedIds } = await req.json();
  if (!Array.isArray(orderedIds) || orderedIds.some((v: unknown) => typeof v !== "number")) {
    return NextResponse.json({ error: "orderedIds must be an array of numbers" }, { status: 400 });
  }

  const { data: rows } = await supabaseServer
    .from("all_filters_filters")
    .select("id, translation_id")
    .in("id", orderedIds);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const translationIdById = new Map((rows || []).map((r: any) => [r.id, r.translation_id]));

  await Promise.all(orderedIds.map((id: number, index: number) => {
    const translationId = translationIdById.get(id);
    if (translationId === undefined) return Promise.resolve();
    return supabaseServer.from("all_filters_filters").update({ priority: index }).eq("translation_id", translationId);
  }));

  return NextResponse.json({ success: true });
}
