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

  // Product counts per category come from the category_product_counts view
  // (scripts/create-category-product-counts-view.sql), a single GROUP BY
  // query — this used to be ~150-160 separate per-category HEAD-count
  // requests (one per row in `cats`), which was by far the largest source
  // of this project's Supabase egress usage since this page is
  // force-dynamic and re-fetches on every visit.
  const { data: countRows } = await supabaseServer
    .from("category_product_counts")
    .select("translation_id, product_count");

  const productCounts: Record<number, number> = Object.fromEntries(
    (countRows || []).map((r: any) => [r.translation_id, r.product_count])
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
