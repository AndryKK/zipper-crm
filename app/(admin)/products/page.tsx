import { Header } from "@/components/admin/header";
import { Button } from "@/components/ui/button";
import { supabaseServer } from "@/lib/supabase";
import { getImgUrl } from "@/lib/utils";
import Link from "next/link";
import { Plus, Eye, EyeOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ProductsSearch } from "./products-search";
import { DeleteProductButton } from "./delete-product-button";
import { EditProductLink } from "./edit-product-link";
import { DuplicateProductButton } from "./duplicate-product-button";
import { UrlPagination } from "@/components/admin/url-pagination";
import { CopyableText } from "@/components/admin/copyable-text";
import { ImageZoom } from "@/components/admin/image-zoom";
import { resolveStorefrontGroups, buildStorefrontProductPath } from "@/lib/products";
import { SITE_URL } from "@/lib/price-lists";

export const dynamic = "force-dynamic";

// products.active does NOT actually hide a product from the storefront
// (verified against the live site) — products.package is what product.php
// checks (via measures.can_be_added_to_cart) to show "Нема в наявності" and
// disable the buy button. Keyed by measures.translation_id (1-5), which is
// what `package` stores. See app/(admin)/products/product-form.tsx.
const AVAILABILITY: Record<number, { title: string; variant: "success" | "warning" | "secondary" | "default" | "destructive"; dot: string; canBuy: boolean }> = {
  1: { title: "В наявності", variant: "success", dot: "#10b981", canBuy: true },
  2: { title: "Закінчується", variant: "warning", dot: "#f59e0b", canBuy: true },
  3: { title: "Очікується", variant: "secondary", dot: "#6b7280", canBuy: false },
  4: { title: "Під замовлення", variant: "default", dot: "#2563eb", canBuy: false },
  5: { title: "Немає в наявності", variant: "destructive", dot: "#ef4444", canBuy: false },
};

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

  // Category filtering:
  // products_categories.cid = categories.translation_id (the original/primary language id).
  // URL param ?cat=X is the translation_id, so cid == catId directly.
  let translationIdFilter: number[] | null = null;
  if (catId !== undefined && catId !== 0) {
    const { data: pcRows } = await supabaseServer
      .from("products_categories")
      .select("pid")
      .eq("cid", catId);

    const productIds = (pcRows || []).map((r: any) => r.pid);

    if (productIds.length > 0) {
      const { data: ruInCat } = await supabaseServer
        .from("products")
        .select("translation_id")
        .eq("lang", "ru")
        .in("id", productIds);
      translationIdFilter = (ruInCat || []).map((p: any) => p.translation_id);
    } else {
      translationIdFilter = [];
    }
  }

  // Typo-tolerant, punctuation-insensitive, word-order-independent search
  // (title, pcode, and any filter value assigned to the product) — see
  // scripts/add-fuzzy-product-search.sql's search_products() for the actual
  // matching logic.
  let matchedTranslationIds: number[] | null = null;
  if (q) {
    const { data: matches } = await supabaseServer.rpc("search_products", { search_query: q });
    matchedTranslationIds = [...new Set(((matches ?? []) as { translation_id: number }[]).map((m) => m.translation_id))];
  }

  // Category and search combine with AND — searching within a category
  // only shows that category's matches, same as before this change.
  let effectiveTranslationIds: number[] | null = null;
  if (translationIdFilter !== null && matchedTranslationIds !== null) {
    effectiveTranslationIds = translationIdFilter.filter((id) => matchedTranslationIds!.includes(id));
  } else if (translationIdFilter !== null) {
    effectiveTranslationIds = translationIdFilter;
  } else if (matchedTranslationIds !== null) {
    effectiveTranslationIds = matchedTranslationIds;
  }

  // Only the columns this list renders — products carries several large
  // text fields (descr, text, seo_*) that this table never shows, and this
  // page is force-dynamic (re-fetched on every visit), so select("*") here
  // was needlessly inflating egress on one of the most-visited admin pages.
  let query = supabaseServer
    .from("products")
    .select(
      "id, img, title, pcode, price, price_sale, package, translation_id, uri, label_action, labelAction:label_action, translationId:translation_id",
      { count: "exact" }
    )
    .eq("lang", "uk");

  if (catId === 0) {
    query = query.eq("pid", 0);
    if (matchedTranslationIds !== null) query = query.in("translation_id", matchedTranslationIds);
  } else if (effectiveTranslationIds !== null) {
    // An empty array here (no matches) is passed straight to .in() rather
    // than early-returning a bare "not found" message — that early return
    // used to skip the whole page chrome, including <ProductsSearch>
    // itself, so the search box vanished the moment a search came up
    // empty. .in("translation_id", []) is a normal, well-supported
    // PostgREST no-op filter (zero rows), and the existing empty-table
    // row below already renders a "Товарів не знайдено" message inside
    // the full page.
    query = query.in("translation_id", effectiveTranslationIds);
  }

  // Newest-added first — order of addition, not the storefront's manual
  // "priority" position (which used to sort this list too, interleaving
  // old and new products instead of showing them in creation order).
  const { data: products, count } = await query
    .order("id", { ascending: false })
    .range((page - 1) * limit, page * limit - 1);

  const total = count ?? 0;
  const totalPages = Math.ceil(total / limit);
  const allProducts = (products || []) as any[];

  // A handful of product groups are entirely missing their uk row (e.g.
  // translation_id 10318, pcode "bs10318" — reported as "CRM не шукає
  // bs10318") — invisible to this uk-scoped list no matter what, browsing
  // or search. search_products already searches across every language, so
  // any such group it matched but that isn't among allProducts (the uk
  // rows) above must be one of these orphans — fetch a representative row
  // (any lang) for display, badged by language, linked straight to that
  // language's own storefront domain since there's no uk page for them —
  // see SITE_URL below.
  let orphanProducts: any[] = [];
  if (q && matchedTranslationIds && matchedTranslationIds.length) {
    // Whether a matched group has a uk row at all is a catalog-wide
    // question, not a "is it on this page" one — allProducts here is only
    // the current 30-row page (see the .range() above), so checking
    // against it alone mislabeled almost every match beyond page 1 as an
    // "orphan" once fuzzy search started returning hundreds of matches
    // instead of the old ILIKE's usual handful.
    const { data: ukCoverageRows } = await supabaseServer
      .from("products")
      .select("translation_id")
      .eq("lang", "uk")
      .in("translation_id", matchedTranslationIds);
    const coveredGroupIds = new Set((ukCoverageRows ?? []).map((r: any) => r.translation_id));
    const orphanTrIds = matchedTranslationIds.filter((id) => !coveredGroupIds.has(id));
    if (orphanTrIds.length) {
      const { data: orphanRows } = await supabaseServer
        .from("products")
        .select("id, img, title, pcode, price, price_sale, package, translation_id, uri, label_action, lang")
        .in("translation_id", orphanTrIds)
        .neq("lang", "uk");
      const seenGroupIds = new Set<number>();
      for (const p of (orphanRows ?? []) as any[]) {
        if (seenGroupIds.has(p.translation_id)) continue;
        seenGroupIds.add(p.translation_id);
        orphanProducts.push(p);
      }
    }
  }
  const allProductsWithOrphans = [...allProducts, ...orphanProducts];

  // Storefront link per row — see lib/products.ts's resolveStorefrontGroups
  // for why this needs a batch lookup and can't just be `${uri}`: an
  // inactive color variant has no live page of its own, the site shows it
  // on the active sibling's page instead. Only run against allProducts
  // (the uk rows) — orphanProducts get their own direct ru-domain link
  // below since they have no uk group to resolve against.
  const { ukRowByGroupId, mainUkUriByGroupId } = await resolveStorefrontGroups(
    allProducts.map((p) => p.translation_id)
  );
  const productUrlById = new Map<number, string | null>([
    ...allProducts.map((p): [number, string | null] => {
      const path = buildStorefrontProductPath(p.translation_id, ukRowByGroupId, mainUkUriByGroupId, p.uri);
      return [p.id, path ? `${process.env.MAIN_DOMAIN}${path}` : null];
    }),
    ...orphanProducts.map((p): [number, string | null] => [
      p.id,
      p.uri ? `${SITE_URL[p.lang] ?? SITE_URL.ru}/product/${p.uri}` : null,
    ]),
  ]);

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
      <div className="p-4 md:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
          <ProductsSearch defaultValue={q} />
          <Link href={`/products/new${catId !== undefined ? `?cat=${catId}` : ""}`} className="w-full sm:w-auto">
            <Button className="w-full sm:w-auto"><Plus className="h-4 w-4 mr-1.5" />Додати товар</Button>
          </Link>
        </div>

        <div className="flex items-center gap-3 text-sm" style={{ color: "var(--text-muted)" }}>
          <span>Знайдено: {total + orphanProducts.length} товарів</span>
          {catId !== undefined && (
            <Link href="/products" className="text-blue-500 hover:underline text-xs">
              × скинути фільтр
            </Link>
          )}
        </div>

        {/* ── Mobile card list (< md) ──────────────────────────────────── */}
        <div className="md:hidden space-y-3">
          {allProductsWithOrphans.map((product: any) => {
            const avail = AVAILABILITY[product.package as number] ?? AVAILABILITY[1];
            const url = productUrlById.get(product.id);
            const category = catMap.get(product.translation_id);
            return (
              <div key={product.id} className="crm-card" style={{ padding: 14 }}>
                <div style={{ display: "flex", gap: 10 }}>
                  {product.img ? (
                    <ImageZoom
                      src={getImgUrl(product.img, "products")}
                      alt={product.title}
                      className="h-12 w-12 rounded object-cover flex-shrink-0"
                    />
                  ) : (
                    <div className="h-12 w-12 rounded flex items-center justify-center text-xs flex-shrink-0" style={{ background: "var(--bg)", color: "var(--text-muted)" }}>—</div>
                  )}
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="font-mono" style={{ fontSize: 11, color: "var(--text-muted)" }}>#{product.id}</div>
                    {url ? (
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium"
                        style={{ color: "inherit", textDecoration: "none" }}
                      >
                        {product.title}
                      </a>
                    ) : (
                      <div className="font-medium">{product.title}</div>
                    )}
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
                      {product.label_action === 1 && <Badge variant="warning">Акція</Badge>}
                      {product.lang && product.lang !== "uk" && (
                        <Badge variant="secondary">Без UK, {product.lang.toUpperCase()}</Badge>
                      )}
                    </div>
                  </div>
                  <div className="font-medium whitespace-nowrap" style={{ textAlign: "right", flexShrink: 0 }}>
                    {product.price_sale ? (
                      <>
                        <div className="text-red-600">{Number(product.price_sale).toFixed(2)}</div>
                        <div className="line-through text-xs" style={{ color: "var(--text-muted)" }}>{Number(product.price).toFixed(2)}</div>
                      </>
                    ) : (
                      <div>{Number(product.price).toFixed(2)}</div>
                    )}
                  </div>
                </div>

                <div
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
                    marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--border)",
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>
                      {product.pcode ? <CopyableText value={product.pcode} /> : "—"}
                    </div>
                    {category && (
                      <div
                        className="text-xs"
                        style={{ color: "var(--text-muted)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                      >
                        {category}
                      </div>
                    )}
                  </div>
                  <Badge variant={avail.variant} className="inline-flex items-center gap-1" style={{ flexShrink: 0 }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: avail.dot, flexShrink: 0 }} />
                    {avail.title}
                  </Badge>
                </div>

                <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 4, marginTop: 8 }}>
                  <EditProductLink productId={product.id} />
                  <DuplicateProductButton productId={product.id} />
                  <DeleteProductButton productId={product.id} />
                </div>
              </div>
            );
          })}
          {allProductsWithOrphans.length === 0 && (
            <div className="crm-card" style={{ padding: "48px 16px", textAlign: "center", color: "var(--text-muted)" }}>
              Товарів не знайдено
            </div>
          )}
        </div>

        {/* ── Desktop table (>= md) ────────────────────────────────────── */}
        <div className="crm-card overflow-hidden hidden md:block">
          <table className="crm-table">
            <thead>
              <tr>
                <th style={{ width: 48 }}>ID</th>
                <th style={{ width: 80 }}>Фото</th>
                <th>Назва</th>
                <th>Артикул</th>
                <th>Ціна</th>
                <th>Категорія</th>
                <th>Статус</th>
                <th style={{ textAlign: "right" }}>Дії</th>
              </tr>
            </thead>
            <tbody>
              {allProductsWithOrphans.map((product: any) => (
                <tr key={product.id}>
                  <td className="font-mono text-xs" style={{ color: "var(--text-muted)" }}>{product.id}</td>
                  <td>
                    {product.img ? (
                      <ImageZoom
                        src={getImgUrl(product.img, "products")}
                        alt={product.title}
                        className="h-10 w-10 rounded object-cover"
                      />
                    ) : (
                      <div className="h-10 w-10 rounded flex items-center justify-center text-xs" style={{ background: "var(--bg)", color: "var(--text-muted)" }}>—</div>
                    )}
                  </td>
                  <td>
                    {productUrlById.get(product.id) ? (
                      <a
                        href={productUrlById.get(product.id)!}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium"
                        style={{ color: "inherit", textDecoration: "none", cursor: "pointer" }}
                      >
                        {product.title}
                      </a>
                    ) : (
                      <div className="font-medium">{product.title}</div>
                    )}
                    {product.label_action === 1 && <Badge variant="warning" className="mt-0.5">Акція</Badge>}
                    {/* This row has no uk pair at all (see the orphanProducts
                        comment above) — flagged so it's obvious this isn't
                        the usual uk catalog row before someone edits it. */}
                    {product.lang && product.lang !== "uk" && (
                      <Badge variant="secondary" className="mt-0.5">Без UK, {product.lang.toUpperCase()}</Badge>
                    )}
                  </td>
                  <td className="font-mono text-xs" style={{ color: "var(--text-muted)" }}>
                    {product.pcode ? <CopyableText value={product.pcode} /> : "—"}
                  </td>
                  <td className="font-medium whitespace-nowrap">
                    {product.price_sale ? (
                      <span>
                        <span className="text-red-600">{Number(product.price_sale).toFixed(2)}</span>
                        <span className="line-through ml-1 text-xs" style={{ color: "var(--text-muted)" }}>{Number(product.price).toFixed(2)}</span>
                      </span>
                    ) : (
                      <span>{Number(product.price).toFixed(2)}</span>
                    )}
                  </td>
                  <td className="text-xs" style={{ color: "var(--text-muted)" }}>
                    {catMap.get(product.translation_id) ?? "—"}
                  </td>
                  <td>
                    {(() => {
                      const avail = AVAILABILITY[product.package as number] ?? AVAILABILITY[1];
                      return (
                        <Badge variant={avail.variant} className="inline-flex items-center gap-1">
                          <span style={{ width: 6, height: 6, borderRadius: "50%", background: avail.dot, flexShrink: 0 }} />
                          {avail.canBuy ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                          {avail.title}
                        </Badge>
                      );
                    })()}
                  </td>
                  <td>
                    <div className="flex items-center justify-end gap-1">
                      <EditProductLink productId={product.id} />
                      <DuplicateProductButton productId={product.id} />
                      <DeleteProductButton productId={product.id} />
                    </div>
                  </td>
                </tr>
              ))}
              {allProductsWithOrphans.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center" style={{ padding: "48px 16px", color: "var(--text-muted)" }}>
                    Товарів не знайдено
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <UrlPagination
          page={page}
          totalPages={totalPages}
          basePath="/products"
          params={{ q: q || undefined, cat: catId }}
        />
      </div>
    </>
  );
}
