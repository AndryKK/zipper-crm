import { supabaseServer } from "@/lib/supabase";

export type FilterGroupWithChildren = {
  id: number;
  translation_id: number;
  translationId: number;
  title: string;
  filters: { id: number; translationId: number; title: string }[];
  // Categories (translation_id) this filter group is assigned to show in —
  // see all_filters_items below. Lets product-form.tsx's Filters tab only
  // show a group when it's actually relevant to the product's own selected
  // categories, instead of every filter group in the whole catalog.
  categoryIds: number[];
};

// Loads every filter group (all_filters) together with its values
// (all_filters_filters, keyed by the group's translation_id — NOT its
// serial id, confirmed against the live site's catalog.php query) and the
// categories it's assigned to (all_filters_items: fid = filter group's
// translation_id, cid = category's translation_id — same table
// app/api/categories/[id]/filters and app/api/filters/[id]/categories
// manage from either side).
//
// Shared by app/(admin)/products/[id]/page.tsx (edit) and
// app/(admin)/products/new/page.tsx (create) — both previously had their
// own near-identical copy of this fetch.
export async function getFiltersWithChildren(): Promise<FilterGroupWithChildren[]> {
  const { data: allFilters } = await supabaseServer
    .from("all_filters")
    .select("id, translation_id, title, translationId:translation_id")
    .eq("lang", "uk")
    .order("priority", { ascending: true });

  const filterList = (allFilters ?? []) as unknown as FilterGroupWithChildren[];
  if (!filterList.length) return [];

  const groupTrIds = filterList.map((f) => f.translation_id);
  const [{ data: filterItems }, { data: categoryLinks }] = await Promise.all([
    supabaseServer
      .from("all_filters_filters")
      .select("id, pid, title, translationId:translation_id")
      .in("pid", groupTrIds)
      .eq("lang", "uk")
      .order("priority", { ascending: true }),
    supabaseServer.from("all_filters_items").select("fid, cid").in("fid", groupTrIds),
  ]);

  const valuesByGroup: Record<number, FilterGroupWithChildren["filters"]> = {};
  for (const fi of (filterItems ?? []) as { pid: number; id: number; translationId: number; title: string }[]) {
    (valuesByGroup[fi.pid] ??= []).push(fi);
  }

  const categoryIdsByGroup: Record<number, number[]> = {};
  for (const link of (categoryLinks ?? []) as { fid: number; cid: number }[]) {
    (categoryIdsByGroup[link.fid] ??= []).push(link.cid);
  }

  return filterList.map((f) => ({
    ...f,
    filters: valuesByGroup[f.translation_id] ?? [],
    categoryIds: categoryIdsByGroup[f.translation_id] ?? [],
  }));
}
