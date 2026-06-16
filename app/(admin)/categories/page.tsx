import { Header } from "@/components/admin/header";
import { supabaseServer } from "@/lib/supabase";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { CategoryTree } from "@/components/admin/category-tree";

export const dynamic = "force-dynamic";

export default async function CategoriesPage() {
  const { data: categories } = await supabaseServer
    .from("categories")
    .select("id, translation_id, pid, title, priority, visibility")
    .eq("lang", "uk")
    .order("priority", { ascending: true });

  const cats = (categories || []) as any[];

  // Count products per category.
  // products_categories.cid = categories.id (MySQL pk, preserved in migration).
  // Using parallel HEAD-only count queries to avoid PostgREST 1000-row default limit.
  // products_categories.cid = original MySQL categories.id.
  // For the primary (RU) row: id = translation_id.
  // For the UK copy: id ≠ translation_id, but cid still references the RU id = translation_id.
  // Therefore cid == categories.translation_id for all rows.
  const countPairs = await Promise.all(
    cats.map(async (cat) => {
      const { count } = await supabaseServer
        .from("products_categories")
        .select("*", { count: "exact", head: true })
        .eq("cid", cat.translation_id);
      return [cat.translation_id, count ?? 0] as const;
    })
  );

  const productCounts: Record<number, number> = Object.fromEntries(countPairs);

  return (
    <>
      <Header title="Категорії" />
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            {cats.filter((c) => c.pid === 0).length} кореневих категорій
          </p>
          <Link href="/categories/new">
            <Button>
              <Plus className="h-4 w-4 mr-1.5" />
              Додати категорію
            </Button>
          </Link>
        </div>

        <CategoryTree categories={cats} productCounts={productCounts} />
      </div>
    </>
  );
}
