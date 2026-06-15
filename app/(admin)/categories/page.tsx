import { Header } from "@/components/admin/header";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { CategoryRow } from "@/components/admin/category-row";

export const dynamic = "force-dynamic";

export default async function CategoriesPage() {
  const [categories, ruCategories] = await Promise.all([
    prisma.category.findMany({
      where: { lang: "uk" },
      orderBy: { priority: "asc" },
    }),
    prisma.category.findMany({
      where: { lang: "ru" },
      select: { id: true, translationId: true },
    }),
  ]);

  const ruIdMap = new Map(ruCategories.map((c) => [c.translationId, c.id]));

  const byPid = new Map<number, typeof categories>();
  for (const cat of categories) {
    const arr = byPid.get(cat.pid) ?? [];
    arr.push(cat);
    byPid.set(cat.pid, arr);
  }

  function renderTree(pid: number, depth: number): React.JSX.Element[] {
    return (byPid.get(pid) ?? []).flatMap((cat) => [
      <CategoryRow key={cat.id} cat={cat} indent={depth} ruId={ruIdMap.get(cat.translationId)} />,
      ...renderTree(cat.translationId, depth + 1),
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
