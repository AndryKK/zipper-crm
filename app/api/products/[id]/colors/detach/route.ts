import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { auth } from "@/lib/auth";
import { findColorGroupTrIds, unlinkProductColors } from "@/lib/products";

// POST /api/products/[id]/colors/detach
// Body: { keepActiveTranslationId?: number }
//
// Fully severs this color from its whole color group — not "remove one
// link to one other color" (that's DELETE .../colors above), but "this
// product becomes its own standalone group of one," which can then have
// new colors added under it independently (see the "Відділити товар"
// button in product-form.tsx). Unlike the soft-unlink DELETE handler,
// which only removes the direct edge between two specific products, this
// uses unlinkProductColors to remove EVERY products_colors edge this
// color's translation_id (and row ids, for old wrongly-keyed links —
// see docs/product-colors.md) participates in, since the group's graph
// isn't guaranteed to be a simple star and a color could still be
// reachable via another path otherwise.
//
// If this color was the group's active=1 ("main"/searchable) one, the
// group left behind has zero active members once it's gone — the caller
// must say which remaining color inherits that (product-form.tsx shows a
// popup for this when needed); we refuse the request rather than guess.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { keepActiveTranslationId } = await req.json().catch(() => ({}));
  const sourceId = parseInt(id);

  const { data: sourceProd } = await supabaseServer.from("products").select("translation_id").eq("id", sourceId).single();
  if (!sourceProd) return NextResponse.json({ error: "Товар не знайдено" }, { status: 404 });
  const sourceTrId = (sourceProd as { translation_id: number }).translation_id;

  const { data: sourceVars } = await supabaseServer.from("products").select("id, active").eq("translation_id", sourceTrId);
  const sourceIds = (sourceVars ?? []).map((s) => s.id);
  const wasActive = (sourceVars ?? []).some((s) => s.active === 1);

  const groupTrIds = await findColorGroupTrIds(sourceId);
  const remainingTrIds = groupTrIds.filter((t) => t !== sourceTrId);

  if (remainingTrIds.length === 0) {
    // Nothing links to it — already its own standalone group.
    return NextResponse.json({ success: true });
  }

  if (wasActive) {
    if (!keepActiveTranslationId || !remainingTrIds.includes(keepActiveTranslationId)) {
      return NextResponse.json({ error: "Потрібно вказати, який колір лишити основним у групі" }, { status: 400 });
    }
  }

  await unlinkProductColors([sourceTrId, ...sourceIds]);

  // The detached color is now its own standalone group of one — must be
  // active=1 for itself, per docs/product-colors.md ("рівно один товар з
  // active=1" on every group, a lone product trivially included).
  await supabaseServer.from("products").update({ active: 1 }).eq("translation_id", sourceTrId);

  if (wasActive && keepActiveTranslationId) {
    const others = remainingTrIds.filter((t) => t !== keepActiveTranslationId);
    await Promise.all([
      supabaseServer.from("products").update({ active: 1 }).eq("translation_id", keepActiveTranslationId),
      others.length
        ? supabaseServer.from("products").update({ active: 0 }).in("translation_id", others)
        : Promise.resolve(),
    ]);
  }

  return NextResponse.json({ success: true });
}
