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
          .select("*, translationId:translation_id, seoTitle:seo_title, seoKey:seo_key, seoDescr:seo_descr, image_new_shop")
          .eq("id", parseInt(id))
          .single(),
    // Only used to populate the "parent category" dropdown (id/title),
    // so no need for the full row (seo_*, descr, text, img, discount...).
    supabaseServer
      .from("categories")
      .select("id, title, translationId:translation_id")
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
