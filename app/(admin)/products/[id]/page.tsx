import { Header } from "@/components/admin/header";
import { supabaseServer } from "@/lib/supabase";
import { notFound } from "next/navigation";
import { ProductForm } from "../product-form";

export const dynamic = "force-dynamic";

const SEL = "*, labelAction:label_action, translationId:translation_id, seoTitle:seo_title, seoKey:seo_key, seoDescr:seo_descr";

// BFS: знайти всі translationId кольорів, що входять у групу.
// Стартує з translationId поточного товару і розширюється через products_colors.
async function findColorGroup(startLangIds: number[], startTrId: number): Promise<number[]> {
  // Відвідані translationId (щоб не зациклитись)
  const visitedTrIds = new Set<number>([startTrId]);
  // Всі product.id, за якими вже шукали зв'язки
  const visitedPIds = new Set<number>(startLangIds);
  // Поточний фронт пошуку (product IDs)
  let frontier = startLangIds;

  while (frontier.length > 0) {
    const { data: links } = await supabaseServer
      .from("products_colors")
      .select("pid, pid_with")
      .or(`pid.in.(${frontier.join(",")}),pid_with.in.(${frontier.join(",")})`);

    // Зібрати нові product IDs
    const newPIds: number[] = [];
    for (const lk of links || []) {
      if (!visitedPIds.has(lk.pid)) { visitedPIds.add(lk.pid); newPIds.push(lk.pid); }
      if (!visitedPIds.has(lk.pid_with)) { visitedPIds.add(lk.pid_with); newPIds.push(lk.pid_with); }
    }

    if (!newPIds.length) break;

    // Отримати translationId для нових product IDs
    const { data: prods } = await supabaseServer
      .from("products")
      .select("id, translation_id")
      .in("id", newPIds);

    const newTrIds = [...new Set((prods || []).map((p: any) => p.translation_id))]
      .filter((tid) => !visitedTrIds.has(tid));

    if (!newTrIds.length) break;

    // Завантажити всі мовні варіанти нових translationId
    const { data: newVars } = await supabaseServer
      .from("products")
      .select("id")
      .in("translation_id", newTrIds);

    const newIds = (newVars || []).map((p: any) => p.id);
    newIds.forEach((id: number) => visitedPIds.add(id));
    newTrIds.forEach((tid: number) => visitedTrIds.add(tid));
    frontier = newIds;
  }

  // Повернути всі translationId окрім початкового
  return [...visitedTrIds].filter((tid) => tid !== startTrId);
}

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const pid = parseInt(id);

  const { data: product } = await supabaseServer.from("products").select(SEL).eq("id", pid).single();
  if (!product) notFound();

  const baseTrId: number = (product as any).translationId;

  // Всі мовні варіанти поточного товару
  const { data: langVars } = await supabaseServer.from("products").select(SEL)
    .eq("translation_id", baseTrId);
  const langVariants: any[] = langVars || [];
  const langIds = langVariants.map((p: any) => p.id);

  // BFS: знайти всі translationId кольорових груп
  const colorTrIds = await findColorGroup(langIds, baseTrId);

  // Завантажити всі кольорові варіанти
  let colorGroups: { langVariants: any[]; photos: any[]; photos2: any[] }[] = [];
  if (colorTrIds.length > 0) {
    const { data: colorAllVars } = await supabaseServer.from("products").select(SEL)
      .in("translation_id", colorTrIds);

    // Згрупувати по translationId
    const grouped: Record<number, any[]> = {};
    for (const p of colorAllVars || []) {
      (grouped[(p as any).translationId] ??= []).push(p);
    }

    const allColorIds = (colorAllVars || []).map((p: any) => p.id);
    const [{ data: cPhotos }, { data: cPhotos2 }] = await Promise.all([
      supabaseServer.from("products_photos").select("*").in("pid", allColorIds).order("priority"),
      supabaseServer.from("products_photos2").select("*").in("pid", allColorIds).order("priority"),
    ]);

    colorGroups = Object.values(grouped).map((group) => ({
      langVariants: group,
      photos: (cPhotos || []).filter((p: any) => group.some((v: any) => v.id === p.pid)),
      photos2: (cPhotos2 || []).filter((p: any) => group.some((v: any) => v.id === p.pid)),
    }));
  }

  const ukVariant: any = langVariants.find((p: any) => p.lang === "uk") || langVariants[0];

  const [
    { data: mainPhotos },
    { data: mainPhotos2 },
    { data: mainChars },
    { data: categories },
    { data: measures },
    { data: langs },
    { data: productCats },
  ] = await Promise.all([
    supabaseServer.from("products_photos").select("*").in("pid", langIds).order("priority"),
    supabaseServer.from("products_photos2").select("*").in("pid", langIds).order("priority"),
    supabaseServer.from("products_chars").select("*").in("pid", langIds).order("priority"),
    supabaseServer.from("categories").select("*, translationId:translation_id").eq("lang", "uk").order("title"),
    supabaseServer.from("measures").select("*").eq("lang", "uk").order("title"),
    supabaseServer.from("langs").select("*").eq("active", 1).order("priority"),
    supabaseServer.from("products_categories").select("cid").in("pid", langIds),
  ]);

  // Filters
  const { data: allFilters } = await supabaseServer.from("all_filters")
    .select("*, translationId:translation_id").eq("lang", "uk").order("priority");
  const filterList = allFilters || [];
  let filtersWithChildren: any[] = filterList;
  if (filterList.length) {
    const { data: filterItems } = await supabaseServer.from("all_filters_filters")
      .select("*, translationId:translation_id, filterId:filter_id")
      .in("pid", filterList.map((f: any) => f.id)).eq("lang", "uk").order("priority");
    const fm: Record<number, any[]> = {};
    for (const fi of filterItems || []) (fm[(fi as any).pid] ??= []).push(fi);
    filtersWithChildren = filterList.map((f: any) => ({ ...f, filters: fm[f.id] || [] }));
  }

  return (
    <>
      <Header title={`Редагувати: ${ukVariant?.title || (product as any).title}`} />
      <ProductForm
        langVariants={langVariants}
        colorGroups={colorGroups}
        mainPhotos={mainPhotos || []}
        mainPhotos2={mainPhotos2 || []}
        mainChars={mainChars || []}
        productCategories={[...new Set((productCats || []).map((c: any) => c.cid))]}
        categories={(categories || []) as any[]}
        measures={(measures || []) as any[]}
        filters={filtersWithChildren}
        langs={(langs || []) as any[]}
        mode="edit"
      />
    </>
  );
}
