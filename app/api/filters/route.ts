import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { auth } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: filters } = await supabaseServer
    .from("all_filters")
    .select("*, translationId:translation_id")
    .eq("lang", "uk")
    .order("priority", { ascending: true });

  const allFilters = filters || [];

  // Callers that only need the group list itself (e.g. the category-side
  // "which filters apply here" picker) skip the values join entirely.
  if (req.nextUrl.searchParams.get("groupsOnly") === "1") {
    return NextResponse.json(allFilters);
  }

  // all_filters_filters.pid references all_filters.translation_id (NOT the
  // serial id) — confirmed against the live site's catalog.php query.
  const filterTranslationIds = allFilters.map((f: any) => f.translation_id);

  let filtersMap: Record<number, any[]> = {};
  if (filterTranslationIds.length) {
    const { data: filterItems } = await supabaseServer
      .from("all_filters_filters")
      .select("*, translationId:translation_id")
      .in("pid", filterTranslationIds)
      .eq("lang", "uk")
      .order("priority", { ascending: true })
      // Tiebreak for values that still share a priority (nothing's been
      // dragged in the UI yet) — kept identical to the storefronts' own
      // ORDER BY (catalog.php/sale.php) on purpose, so what this list
      // shows already matches what's live, not some different fallback.
      .order("title", { ascending: true });
    for (const fi of filterItems || []) {
      if (!filtersMap[fi.pid]) filtersMap[fi.pid] = [];
      filtersMap[fi.pid].push(fi);
    }
  }

  const items = allFilters.map((f: any) => ({ ...f, filters: filtersMap[f.translation_id] || [] }));
  return NextResponse.json(items);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();

  const { data: maxTransRow } = await supabaseServer
    .from("all_filters")
    .select("translation_id")
    .order("translation_id", { ascending: false })
    .limit(1)
    .single();
  const translationId = ((maxTransRow as any)?.translation_id ?? 0) + 1;

  const { data: langs } = await supabaseServer.from("langs").select("*").eq("active", 1);
  const activeLangs = langs || [];

  // body.titleRu — explicit ru translation typed alongside the uk one in
  // the "add filter" form. Without it, the ru row used to get a raw
  // "[ru] {title}" placeholder nobody ever went back to fix (same gap the
  // rename endpoint's own titleRu now covers for existing rows — see
  // app/api/filters/[id]/route.ts).
  const titleRu = (body.titleRu ?? "").trim();
  const items = await Promise.all(activeLangs.map(async (l: any) => {
    const title = l.code === body.lang ? body.title
      : l.code === "ru" && titleRu ? titleRu
      : `[${l.code}] ${body.title}`;
    const { data } = await supabaseServer.from("all_filters").insert({
      translation_id: translationId,
      lang: l.code,
      title,
    }).select("*").single();
    return data;
  }));

  return NextResponse.json(items.find((i: any) => i?.lang === body.lang) ?? items[0], { status: 201 });
}
