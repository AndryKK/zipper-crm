import Link from "next/link";
import { supabaseServer } from "@/lib/supabase";
import { Header } from "@/components/admin/header";
import { Button } from "@/components/ui/button";
import { Plus, Pencil } from "lucide-react";

export default async function NewsPage({ searchParams }: { searchParams: Promise<{ page?: string; q?: string }> }) {
  const { page: pageStr, q } = await searchParams;
  const page = parseInt(pageStr ?? "1");
  const limit = 20;

  let query = supabaseServer
    .from("news")
    .select("*", { count: "exact" })
    .eq("lang", "uk");
  if (q) query = query.ilike("title", `%${q}%`);
  const { data: items, count } = await query
    .order("priority", { ascending: true })
    .range((page - 1) * limit, page * limit - 1);

  const total = count ?? 0;
  const pages = Math.ceil(total / limit);
  const allItems = (items || []) as any[];

  return (
    <>
      <Header title="Новини" />
      <div className="p-4 md:p-6 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">Всього: {total}</p>
          <Button asChild><Link href="/news/new"><Plus className="h-4 w-4 mr-2" />Додати новину</Link></Button>
        </div>

        {/* ── Mobile cards (< md) ────────────────────────────────────── */}
        <div className="md:hidden space-y-3">
          {allItems.map((n: any, i: number) => (
            <Link
              key={n.id}
              href={`/news/${n.id}`}
              className="crm-card block"
              style={{ padding: 14, textDecoration: "none", color: "inherit" }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="font-mono" style={{ fontSize: 11, color: "var(--text-muted)" }}>
                    #{(page - 1) * limit + i + 1}
                  </div>
                  <div style={{ fontWeight: 600, overflowWrap: "break-word" }}>{n.title}</div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
                    {new Date(n.data).toLocaleDateString("uk-UA")}
                  </div>
                </div>
                <Pencil size={14} style={{ flexShrink: 0, color: "var(--text-muted)" }} />
              </div>
            </Link>
          ))}
          {allItems.length === 0 && (
            <div className="crm-card" style={{ padding: "32px 16px", textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
              Новин ще немає
            </div>
          )}
        </div>

        {/* ── Desktop table (>= md) ─────────────────────────────────── */}
        <div className="rounded-md border overflow-hidden bg-white hidden md:block">
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
              {/* # is a page-aware row number (1, 2, 3…), not
                  news.priority — every single row in the table has
                  priority=0 (never actually populated), so this column
                  showed "0" for literally every news item. */}
              {allItems.map((n: any, i: number) => (
                <tr key={n.id} className="border-t hover:bg-gray-50">
                  <td className="px-4 py-2 text-gray-400">{(page - 1) * limit + i + 1}</td>
                  <td className="px-4 py-2 font-medium">{n.title}</td>
                  <td className="px-4 py-2 text-gray-500 text-xs">{new Date(n.data).toLocaleDateString("uk-UA")}</td>
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
          <div className="flex gap-2 flex-wrap">
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
