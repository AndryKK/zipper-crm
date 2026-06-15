import { Header } from "@/components/admin/header";
import { supabaseServer } from "@/lib/supabase";
import { CategoryForm } from "../category-form";

export const dynamic = "force-dynamic";

export default async function NewCategoryPage() {
  const { data } = await supabaseServer
    .from("categories")
    .select("*, translationId:translation_id, seoTitle:seo_title, seoKey:seo_key, seoDescr:seo_descr")
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
