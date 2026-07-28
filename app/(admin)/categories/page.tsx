import { Header } from "@/components/admin/header";
import { supabaseServer } from "@/lib/supabase";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { CategoryTree } from "@/components/admin/category-tree";
import { unstable_cache } from "next/cache";

// Product counts per category come from the category_product_counts view
// (scripts/create-category-product-counts-view.sql), a single GROUP BY
// query — this used to be ~150-160 separate per-category HEAD-count
// requests (one per row in `cats`). That fan-out is fixed, but this page was
// still force-dynamic (re-fetching both queries on every visit) — wrapped
// in unstable_cache since the category tree changes rarely.
const getCategoriesPageData = unstable_cache(
  async () => {
    const { data: categories } = await supabaseServer
      .from("categories")
      .select("id, translation_id, pid, title, priority, visibility, discount, ndiscount")
      .eq("lang", "uk")
      .order("priority", { ascending: true });

    const { data: countRows } = await supabaseServer
      .from("category_product_counts")
      .select("translation_id, product_count");

    return { cats: (categories || []) as any[], countRows: countRows || [] };
  },
  ["categories-page"],
  { revalidate: 180 }
);

export default async function CategoriesPage() {
  const { cats, countRows } = await getCategoriesPageData();

  const productCounts: Record<number, number> = Object.fromEntries(
    countRows.map((r: any) => [r.translation_id, r.product_count])
  );

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
