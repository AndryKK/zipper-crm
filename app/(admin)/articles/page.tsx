import { Header } from "@/components/admin/header";
import { supabaseServer } from "@/lib/supabase";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { ArticleRow } from "@/components/admin/article-row";
import { unstable_cache } from "next/cache";

const getArticles = unstable_cache(
  async () => {
    const { data } = await supabaseServer
      .from("articles")
      .select("*, translationId:translation_id, seoTitle:seo_title, seoKey:seo_key, seoDescr:seo_descr")
      .eq("lang", "uk")
      .order("priority", { ascending: true })
      .order("data", { ascending: false });
    return (data || []) as any[];
  },
  ["articles-page"],
  { revalidate: 180 }
);

export default async function ArticlesPage() {
  const articles = await getArticles();

  return (
    <>
      <Header title="Статті" />
      <div className="p-4 md:p-6 space-y-4">
        <div className="flex justify-end">
          <Link href="/articles/new"><Button><Plus className="h-4 w-4 mr-1.5" />Нова стаття</Button></Link>
        </div>

        {/* ── Mobile cards (< md) ────────────────────────────────────── */}
        <div className="md:hidden space-y-3">
          {articles.map((a: any) => (
            <ArticleRow key={a.id} article={a} variant="card" />
          ))}
          {articles.length === 0 && (
            <div className="crm-card" style={{ padding: "32px 16px", textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
              Статей ще немає
            </div>
          )}
        </div>

        {/* ── Desktop table (>= md) ─────────────────────────────────── */}
        <div className="rounded-md border overflow-hidden bg-white hidden md:block">
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
              {articles.map((a: any) => (
                <ArticleRow key={a.id} article={a} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
