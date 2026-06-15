import { Header } from "@/components/admin/header";
import { supabaseServer } from "@/lib/supabase";
import { ProductForm } from "../product-form";

export const dynamic = "force-dynamic";

export default async function NewProductPage() {
  const [
    { data: categories },
    { data: measures },
    { data: langs },
  ] = await Promise.all([
    supabaseServer.from("categories").select("*, translationId:translation_id, seoTitle:seo_title, seoKey:seo_key, seoDescr:seo_descr").eq("lang", "uk").order("title", { ascending: true }),
    supabaseServer.from("measures").select("*").eq("lang", "uk").order("title", { ascending: true }),
    supabaseServer.from("langs").select("*").eq("active", 1).order("priority", { ascending: true }),
  ]);

  const { data: allFilters } = await supabaseServer
    .from("all_filters")
    .select("*, translationId:translation_id")
    .eq("lang", "uk")
    .order("priority", { ascending: true });

  const filterList = allFilters || [];
  const filterIds = filterList.map((f: any) => f.id);
  let filtersWithChildren: any[] = filterList;
  if (filterIds.length) {
    const { data: filterItems } = await supabaseServer
      .from("all_filters_filters")
      .select("*, translationId:translation_id, filterId:filter_id")
      .in("pid", filterIds)
      .eq("lang", "uk")
      .order("priority", { ascending: true });
    const filtersMap: Record<number, any[]> = {};
    for (const fi of filterItems || []) {
      if (!filtersMap[fi.pid]) filtersMap[fi.pid] = [];
      filtersMap[fi.pid].push(fi);
    }
    filtersWithChildren = filterList.map((f: any) => ({ ...f, filters: filtersMap[f.id] || [] }));
  }

  return (
    <>
      <Header title="Новий товар" />
      <ProductForm
        categories={(categories || []) as any[]}
        measures={(measures || []) as any[]}
        filters={filtersWithChildren}
        langs={(langs || []) as any[]}
        mode="create"
      />
    </>
  );
}
