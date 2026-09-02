import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { auth } from "@/lib/auth";
import { resolveStorefrontGroups, buildStorefrontProductPath } from "@/lib/products";

// Backs the sidebar's "Під мінімумом" tab — every inventory position across
// ALL warehouses currently at or below its min_quantity. Reads
// inventory_low_stock (scripts/create-inventory-low-stock-view.sql) instead
// of filtering inventory itself, since PostgREST can't compare quantity
// against min_quantity (two columns of the same row) via a plain query
// filter — see that script's own comment for why.
const PAGE_SIZE = 50;

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") ?? "";
  const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
  // Same "не введені позиції" filter as the main inventory page (initial_quantity
  // still 0 — never gone through a manual entry, just auto-inserted by the
  // order webhook) — see HIDE_UNENTERED_KEY in components/admin/toggle.tsx.
  const hideUnentered = searchParams.get("hide_unentered") === "1";

  let translationIds: number[] | null = null;
  if (q) {
    // Same typo-tolerant, comma-safe search every other product search on
    // this site uses — see scripts/add-fuzzy-product-search.sql.
    const { data: matches, error } = await supabaseServer.rpc("search_products", { search_query: q });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    translationIds = Array.from(new Set(((matches ?? []) as { translation_id: number }[]).map((m) => m.translation_id)));
    if (translationIds.length === 0) return NextResponse.json({ rows: [], total: 0 });
  }

  let query = supabaseServer.from("inventory_low_stock").select("*", { count: "exact" });
  if (translationIds) query = query.in("product_translation_id", translationIds);
  if (hideUnentered) query = query.gt("initial_quantity", 0);

  const from = (page - 1) * PAGE_SIZE;
  // Worst-off (furthest below minimum, as a fraction) first — a position at
  // 0/100 needs attention before one at 95/100, which plain quantity
  // ascending wouldn't distinguish from a position at 5/1000.
  const { data, error, count } = await query
    .order("quantity", { ascending: true })
    .range(from, from + PAGE_SIZE - 1);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = data ?? [];

  // Same ru/uk display-name fallback as the main inventory route — this
  // view's product_lang is "ru" for every position (inventory is keyed by
  // the ru side of the pair, see lib/inventory.ts) so the page would
  // otherwise show Russian titles.
  const ruIds = rows.filter((r) => r.product_lang === "ru").map((r) => r.product_id);
  const ukTitleByTranslationId = new Map<number, string>();
  if (ruIds.length > 0) {
    const { data: siblings } = await supabaseServer
      .from("products")
      .select("title, translation_id")
      .eq("lang", "uk")
      .in("translation_id", ruIds);
    for (const s of (siblings ?? []) as { title: string; translation_id: number }[]) {
      if (!ukTitleByTranslationId.has(s.translation_id)) ukTitleByTranslationId.set(s.translation_id, s.title);
    }
  }

  const groupIds = rows.map((r) => r.product_translation_id).filter((id): id is number => !!id);
  const { ukRowByGroupId, mainUkUriByGroupId } = await resolveStorefrontGroups(groupIds);

  const items = rows.map((r) => {
    const path = buildStorefrontProductPath(r.product_translation_id, ukRowByGroupId, mainUkUriByGroupId, r.product_uri);
    return {
      ...r,
      displayTitle: ukTitleByTranslationId.get(r.product_translation_id) ?? r.product_title,
      productUrl: path ? `${process.env.MAIN_DOMAIN}${path}` : null,
    };
  });

  return NextResponse.json({ rows: items, total: count ?? 0 });
}
