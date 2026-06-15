import Link from "next/link";
import { prisma } from "@/lib/db";
import { Header } from "@/components/admin/header";
import { Button } from "@/components/ui/button";
import { Plus, Pencil } from "lucide-react";

export default async function NewsPage({ searchParams }: { searchParams: Promise<{ page?: string; q?: string }> }) {
  const { page: pageStr, q } = await searchParams;
  const page = parseInt(pageStr ?? "1");
  const limit = 20;
  const where = { lang: "uk", ...(q ? { title: { contains: q } } : {}) };
  const [items, total] = await Promise.all([
    prisma.news.findMany({ where, skip: (page - 1) * limit, take: limit, orderBy: { priority: "asc" } }),
    prisma.news.count({ where }),
  ]);
  const pages = Math.ceil(total / limit);

  return (
    <>
      <Header title="Новини" />
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">Всього: {total}</p>
          <Button asChild><Link href="/news/new"><Plus className="h-4 w-4 mr-2" />Додати новину</Link></Button>
        </div>
        <div className="rounded-md border overflow-hidden bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left font-medium w-16">#</th>
                <th className="px-4 py-3 text-left font-medium">Заголовок</th>
                <th className="px-4 py-3 text-left font-medium w-32">Дата</th>
                <th className="px-4 py-3 text-right font-medium w-24">Дії</th>
              </tr>
            </thead>
            <tbody>
              {items.map((n) => (
                <tr key={n.id} className="border-t hover:bg-gray-50">
                  <td className="px-4 py-2 text-gray-400">{n.priority}</td>
                  <td className="px-4 py-2 font-medium">{n.title}</td>
                  <td className="px-4 py-2 text-gray-500 text-xs">{n.data.toLocaleDateString("uk-UA")}</td>
                  <td className="px-4 py-2 text-right">
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={`/news/${n.id}`}><Pencil className="h-4 w-4" /></Link>
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pages > 1 && (
          <div className="flex gap-2">
            {Array.from({ length: pages }, (_, i) => i + 1).map((p) => (
              <Button key={p} variant={p === page ? "default" : "outline"} size="sm" asChild>
                <Link href={`/news?page=${p}${q ? `&q=${q}` : ""}`}>{p}</Link>
              </Button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
