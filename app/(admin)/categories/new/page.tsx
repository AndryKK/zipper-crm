import { Header } from "@/components/admin/header";
import { supabaseServer } from "@/lib/supabase";
import { CategoryForm } from "../category-form";

export const dynamic = "force-dynamic";

export default async function NewCategoryPage() {
  const { data } = await supabaseServer
    .from("categories")
    .select("*, translation_id:translationId, seo_title:seoTitle, seo_key:seoKey, seo_descr:seoDescr")
    .eq("lang", "uk")
    .eq("pid", 0)
    .order("title", { ascending: true });
  return (
    <>
      <Header title="Нова категорія" />
      <CategoryForm parentCategories={(data || []) as any[]} />
    </>
  );
}
