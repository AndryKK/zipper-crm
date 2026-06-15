import { Header } from "@/components/admin/header";
import { supabaseServer } from "@/lib/supabase";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { CategoryRow } from "@/components/admin/category-row";

export const dynamic = "force-dynamic";

export default async function CategoriesPage() {
  const [{ data: categories }, { data: ruCategories }] = await Promise.all([
    supabaseServer
      .from("categories")
      .select("*, translationId:translation_id, seoTitle:seo_title, seoKey:seo_key, seoDescr:seo_descr")
      .eq("lang", "uk")
      .order("priority", { ascending: true }),
    supabaseServer
      .from("categories")
      .select("id, translation_id")
      .eq("lang", "ru"),
  ]);

  const allCats = (categories || []) as any[];
  const allRu = (ruCategories || []) as any[];

  const ruIdMap = new Map(allRu.map((c: any) => [c.translation_id, c.id]));

  const byPid = new Map<number, any[]>();
  for (const cat of allCats) {
    const arr = byPid.get(cat.pid) ?? [];
    arr.push(cat);
    byPid.set(cat.pid, arr);
  }

  function renderTree(pid: number, depth: number): React.JSX.Element[] {
    return (byPid.get(pid) ?? []).flatMap((cat: any) => [
      <CategoryRow key={cat.id} cat={cat} indent={depth} ruId={ruIdMap.get(cat.translation_id)} />,
      ...renderTree(cat.translation_id, depth + 1),
    ]);
  }

  return (
    <>
      <Header title="Категорії" />
      <div className="p-6 space-y-4">
        <div className="flex justify-end">
          <Link href="/categories/new">
            <Button><Plus className="h-4 w-4 mr-1.5" />Додати категорію</Button>
          </Link>
        </div>

        <div className="rounded-md border overflow-hidden bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-3 py-3 text-center font-medium text-gray-600 w-20">Пріоритет</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Назва</th>
                <th className="px-3 py-3 text-center font-medium text-gray-600 w-10">RU</th>
                <th className="px-3 py-3 text-center font-medium text-gray-600 w-24">Редагувати</th>
                <th className="px-3 py-3 text-center font-medium text-gray-600 w-20">Видалити</th>
              </tr>
            </thead>
            <tbody>
              {renderTree(0, 0)}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
