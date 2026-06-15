import { Header } from "@/components/admin/header";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { ArticleRow } from "@/components/admin/article-row";

export const dynamic = "force-dynamic";

export default async function ArticlesPage() {
  const articles = await prisma.article.findMany({
    where: { lang: "uk" },
    orderBy: [{ priority: "asc" }, { data: "desc" }],
  });

  return (
    <>
      <Header title="Статті" />
      <div className="p-6 space-y-4">
        <div className="flex justify-end">
          <Link href="/articles/new"><Button><Plus className="h-4 w-4 mr-1.5" />Нова стаття</Button></Link>
        </div>
        <div className="rounded-md border overflow-hidden bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600 w-16">Фото</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Назва</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">URI</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Дата</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">Дії</th>
              </tr>
            </thead>
            <tbody>
              {articles.map((a) => (
                <ArticleRow key={a.id} article={a} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
