import { Header } from "@/components/admin/header";
import { supabaseServer } from "@/lib/supabase";
import { notFound } from "next/navigation";
import { CategoryForm } from "../category-form";

export const dynamic = "force-dynamic";

export default async function EditCategoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const isNew = id === "new";

  const [{ data: category }, { data: allCategories }] = await Promise.all([
    isNew
      ? { data: null }
      : supabaseServer
          .from("categories")
          .select("*, translation_id:translationId, seo_title:seoTitle, seo_key:seoKey, seo_descr:seoDescr")
          .eq("id", parseInt(id))
          .single(),
    supabaseServer
      .from("categories")
      .select("*, translation_id:translationId, seo_title:seoTitle, seo_key:seoKey, seo_descr:seoDescr")
      .eq("lang", "uk")
      .eq("pid", 0)
      .order("title", { ascending: true }),
  ]);

  if (!isNew && !category) notFound();

  return (
    <>
      <Header title={isNew ? "Нова категорія" : `Редагувати: ${(category as any)!.title}`} />
      <CategoryForm category={category as any} parentCategories={(allCategories || []) as any[]} />
    </>
  );
}
