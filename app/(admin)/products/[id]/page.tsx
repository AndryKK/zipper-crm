import { Header } from "@/components/admin/header";
import { supabaseServer } from "@/lib/supabase";
import { notFound } from "next/navigation";
import { ProductForm } from "../product-form";

export const dynamic = "force-dynamic";

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const pid = parseInt(id);
  const [
    { data: product },
    { data: categories },
    { data: measures },
    { data: langs },
    { data: productCategories },
    { data: photos },
    { data: photos2 },
    { data: chars },
  ] = await Promise.all([
    supabaseServer.from("products").select("*, labelAction:label_action, translationId:translation_id, seoTitle:seo_title, seoKey:seo_key, seoDescr:seo_descr").eq("id", pid).single(),
    supabaseServer.from("categories").select("*, translationId:translation_id, seoTitle:seo_title, seoKey:seo_key, seoDescr:seo_descr").eq("lang", "uk").order("title", { ascending: true }),
    supabaseServer.from("measures").select("*").eq("lang", "uk").order("title", { ascending: true }),
    supabaseServer.from("langs").select("*").eq("active", 1).order("priority", { ascending: true }),
    supabaseServer.from("products_categories").select("*").eq("pid", pid),
    supabaseServer.from("products_photos").select("*").eq("pid", pid).order("priority", { ascending: true }),
    supabaseServer.from("products_photos2").select("*").eq("pid", pid).order("priority", { ascending: true }),
    supabaseServer.from("products_chars").select("*").eq("pid", pid).order("priority", { ascending: true }),
  ]);
  const fullProduct = product ? { ...product, categories: productCategories || [], photos: photos || [], photos2: photos2 || [], chars: chars || [] } : null;

  // Load filters with their sub-filters
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

  if (!fullProduct) notFound();

  return (
    <>
      <Header title={`Редагувати: ${(fullProduct as any).title}`} />
      <ProductForm
        product={fullProduct as any}
        categories={(categories || []) as any[]}
        measures={(measures || []) as any[]}
        filters={filtersWithChildren}
        langs={(langs || []) as any[]}
        mode="edit"
      />
    </>
  );
}
