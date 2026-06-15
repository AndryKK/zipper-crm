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
    supabaseServer.from("categories").select("*, translation_id:translationId, seo_title:seoTitle, seo_key:seoKey, seo_descr:seoDescr").eq("lang", "uk").order("title", { ascending: true }),
    supabaseServer.from("measures").select("*").eq("lang", "uk").order("title", { ascending: true }),
    supabaseServer.from("langs").select("*").eq("active", 1).order("priority", { ascending: true }),
  ]);

  const { data: allFilters } = await supabaseServer
    .from("all_filters")
    .select("*, translation_id:translationId")
    .eq("lang", "uk")
    .order("priority", { ascending: true });

  const filterList = allFilters || [];
  const filterIds = filterList.map((f: any) => f.id);
  let filtersWithChildren: any[] = filterList;
  if (filterIds.length) {
    const { data: filterItems } = await supabaseServer
      .from("all_filters_filters")
      .select("*, translation_id:translationId, filter_id:filterId")
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
