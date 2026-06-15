import { Header } from "@/components/admin/header";
import { Button } from "@/components/ui/button";
import { supabaseServer } from "@/lib/supabase";
import Link from "next/link";
import { Plus, Pencil, Eye, EyeOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ProductsSearch } from "./products-search";
import { DeleteProductButton } from "./delete-product-button";

export const dynamic = "force-dynamic";

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; cat?: string }>;
}) {
  const sp = await searchParams;
  const q = sp.q ?? "";
  const page = parseInt(sp.page ?? "1");
  const catId = sp.cat !== undefined ? parseInt(sp.cat) : undefined;
  const limit = 30;

  // Category filtering: find RU products in that category, get their translationIds,
  // then find UK products with those translationIds.
  let translationIdFilter: number[] | null = null;
  if (catId !== undefined && catId !== 0) {
    const { data: ruInCat } = await supabaseServer
      .from("products")
      .select("translation_id")
      .eq("lang", "ru")
      .in(
        "id",
        (await supabaseServer.from("products_categories").select("pid").eq("cid", catId)).data?.map((r: any) => r.pid) || []
      );
    translationIdFilter = (ruInCat || []).map((p: any) => p.translation_id);
  }

  let query = supabaseServer
    .from("products")
    .select("*, labelAction:label_action, translationId:translation_id", { count: "exact" })
    .eq("lang", "uk");

  if (catId === 0) {
    query = query.eq("pid", 0);
  } else if (translationIdFilter !== null) {
    if (translationIdFilter.length === 0) {
      return (
        <>
          <Header title="Товари" />
          <div className="p-6"><p className="text-gray-400">Товарів не знайдено</p></div>
        </>
      );
    }
    query = query.in("translation_id", translationIdFilter);
  }

  if (q) {
    query = query.or(`title.ilike.%${q}%,pcode.ilike.%${q}%`);
  }

  const { data: products, count } = await query
    .order("priority", { ascending: true })
    .order("id", { ascending: false })
    .range((page - 1) * limit, page * limit - 1);

  const total = count ?? 0;
  const totalPages = Math.ceil(total / limit);
  const allProducts = (products || []) as any[];

  // Get active category title if filtering
  let activeCategoryTitle: string | null = null;
  if (catId !== undefined && catId !== 0) {
    const { data: catRow } = await supabaseServer
      .from("categories")
      .select("title")
      .eq("translation_id", catId)
      .eq("lang", "uk")
      .single();
    activeCategoryTitle = (catRow as any)?.title ?? null;
  }

  // Batch-load UK category names via products_categories join
  const tids = allProducts.map((p: any) => p.translation_id).filter(Boolean);
  const catMap = new Map<number, string>();
  if (tids.length) {
    // Get RU product ids for these translation_ids
    const { data: ruProds } = await supabaseServer
      .from("products")
      .select("id, translation_id")
      .in("translation_id", tids)
      .eq("lang", "ru");

    if (ruProds?.length) {
      const ruIds = ruProds.map((p: any) => p.id);
      const { data: pcRows } = await supabaseServer
        .from("products_categories")
        .select("pid, cid")
        .in("pid", ruIds);

      const allCids = [...new Set((pcRows || []).map((r: any) => r.cid))];
      if (allCids.length) {
        const { data: catRows } = await supabaseServer
          .from("categories")
          .select("translation_id, title")
          .in("translation_id", allCids)
          .eq("lang", "uk");

        const catTitleMap: Record<number, string> = {};
        for (const c of catRows || []) {
          catTitleMap[(c as any).translation_id] = (c as any).title;
        }

        // Build pid -> cids map
        const pidCids: Record<number, number[]> = {};
        for (const pc of pcRows || []) {
          if (!pidCids[(pc as any).pid]) pidCids[(pc as any).pid] = [];
          pidCids[(pc as any).pid].push((pc as any).cid);
        }

        // Map translation_id -> category names
        const tidToRuId: Record<number, number> = {};
        for (const rp of ruProds) {
          tidToRuId[(rp as any).translation_id] = (rp as any).id;
        }

        for (const tid of tids) {
          const ruId = tidToRuId[tid];
          if (ruId && pidCids[ruId]) {
            const names = pidCids[ruId].map((cid: number) => catTitleMap[cid]).filter(Boolean).join(", ");
            catMap.set(tid, names);
          }
        }
      }
    }
  }

  return (
    <>
      <Header title={activeCategoryTitle ? `Товари — ${activeCategoryTitle}` : catId === 0 ? "Товари — без категорії" : "Товари"} />
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <ProductsSearch defaultValue={q} />
          <Link href={`/products/new${catId !== undefined ? `?cat=${catId}` : ""}`}>
            <Button><Plus className="h-4 w-4 mr-1.5" />Додати товар</Button>
          </Link>
        </div>

        <div className="flex items-center gap-3 text-sm text-gray-500">
          <span>Знайдено: {total} товарів</span>
          {catId !== undefined && (
            <Link href="/products" className="text-blue-500 hover:underline text-xs">
              × скинути фільтр
            </Link>
          )}
        </div>

        <div className="rounded-md border overflow-hidden bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600 w-12">ID</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 w-20">Фото</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Назва</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Артикул</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Ціна</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Категорія</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Статус</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">Дії</th>
              </tr>
            </thead>
            <tbody>
              {allProducts.map((product: any) => (
                <tr key={product.id} className="border-t hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-2.5 text-gray-400 font-mono text-xs">{product.id}</td>
                  <td className="px-4 py-2.5">
                    {product.img ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`/img/upload-files/products/${product.img}`}
                        alt={product.title}
                        className="h-10 w-10 rounded object-cover"
                      />
                    ) : (
                      <div className="h-10 w-10 rounded bg-gray-100 flex items-center justify-center text-gray-300 text-xs">—</div>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="font-medium">{product.title}</div>
                    {product.label_action === 1 && <Badge variant="warning" className="mt-0.5">Акція</Badge>}
                  </td>
                  <td className="px-4 py-2.5 text-gray-500 font-mono text-xs">{product.pcode ?? "—"}</td>
                  <td className="px-4 py-2.5 font-medium whitespace-nowrap">
                    {product.price_sale ? (
                      <span>
                        <span className="text-red-600">{Number(product.price_sale).toFixed(2)}</span>
                        <span className="text-gray-400 line-through ml-1 text-xs">{Number(product.price).toFixed(2)}</span>
                      </span>
                    ) : (
                      <span>{Number(product.price).toFixed(2)}</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-gray-500 text-xs">
                    {catMap.get(product.translation_id) ?? "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    {product.active === 1
                      ? <Badge variant="success"><Eye className="h-3 w-3 mr-1" />Активний</Badge>
                      : <Badge variant="secondary"><EyeOff className="h-3 w-3 mr-1" />Прихований</Badge>
                    }
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center justify-end gap-1">
                      <Link href={`/products/${product.id}`}>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      </Link>
                      <DeleteProductButton productId={product.id} />
                    </div>
                  </td>
                </tr>
              ))}
              {allProducts.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-gray-400">
                    Товарів не знайдено
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2">
            {page > 1 && (
              <Link href={`/products?page=${page - 1}${q ? `&q=${q}` : ""}${catId !== undefined ? `&cat=${catId}` : ""}`}>
                <Button variant="outline" size="sm">← Попередня</Button>
              </Link>
            )}
            <span className="text-sm text-gray-500">Сторінка {page} з {totalPages}</span>
            {page < totalPages && (
              <Link href={`/products?page=${page + 1}${q ? `&q=${q}` : ""}${catId !== undefined ? `&cat=${catId}` : ""}`}>
                <Button variant="outline" size="sm">Наступна →</Button>
              </Link>
            )}
          </div>
        )}
      </div>
    </>
  );
}
