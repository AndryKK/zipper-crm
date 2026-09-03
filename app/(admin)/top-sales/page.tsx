import { Header } from "@/components/admin/header";
import { supabaseServer } from "@/lib/supabase";
import { getImgUrl } from "@/lib/utils";
import { TrendingUp } from "lucide-react";
import Link from "next/link";
import { ProductQuickView } from "./product-quick-view";
import { unstable_cache } from "next/cache";

const PERIODS = ["all", "year", "month", "week"] as const;
type Period = (typeof PERIODS)[number];
const PERIOD_LABELS: Record<Period, string> = {
  all: "Весь час",
  year: "Рік",
  month: "Місяць",
  week: "Тиждень",
};

// This page used to fetch the ENTIRE orders_item table (every line item ever
// placed, no WHERE, no LIMIT) on every visit to sum quantities client-side —
// the single largest full-table scan found in the app (hundreds of
// thousands of units across the order history). top_selling_products_by_period
// (scripts/create-top-selling-products-function.sql — replaced the earlier
// plain view once a period filter was needed, since a view can't take
// parameters) does the date-filtered SUM/GROUP BY/LIMIT 30 in Postgres
// instead, so this only ever transfers 30 rows. Wrapped in unstable_cache on
// top of that (keyed per period automatically — see the function's own
// argument, which Next.js folds into the cache key) — sales rankings don't
// need to be second-by-second fresh, so repeat visits within the window
// reuse the cached result instead of re-querying at all.
const getTopSales = unstable_cache(
  async (period: Period) => {
    // Emails to exclude from the ranking (test/internal accounts whose
    // purchases shouldn't count) — superadmin-managed list, see the
    // "Топ продажів" section on /settings.
    const { data: settingRow } = await supabaseServer
      .from("settings")
      .select("text")
      .eq("value", "top_sales_excluded_emails")
      .eq("lang", "uk")
      .maybeSingle();
    const excludedLogins = ((settingRow?.text as string | undefined) ?? "")
      .split(/[\n,]/)
      .map((s: string) => s.trim())
      .filter(Boolean);

    const { data: sales, error } = await supabaseServer.rpc("top_selling_products_by_period", {
      p_period: period,
      p_excluded_logins: excludedLogins,
    });
    if (error) { console.error("[top-sales]", error.message); return []; }
    if (!sales || sales.length === 0) return [];

    const pids = (sales as any[]).map((s) => s.product);
    const { data: products } = await supabaseServer
      .from("products")
      .select("id, title, pcode, img, price, price_sale, active")
      .in("id", pids);

    const prodMap: Record<number, any> = {};
    for (const p of products || []) prodMap[p.id] = p;

    return (sales as any[]).map((s, i) => ({
      rank: i + 1,
      pid: s.product,
      quantity: Number(s.total_quantity),
      revenue: Number(s.total_revenue),
      product: prodMap[s.product],
    }));
  },
  ["top-sales"],
  { revalidate: 300 }
);

export default async function TopSalesPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const { period: periodParam } = await searchParams;
  const period: Period = PERIODS.includes(periodParam as Period) ? (periodParam as Period) : "all";

  const items = await getTopSales(period);
  const maxQty = items[0]?.quantity ?? 1;

  return (
    <>
      <Header
        title="Топ продажів"
        subtitle="Найпопулярніші товари за кількістю продажів"
      />

      {/* p-6 (24px, uniform) below md matches /returns' page padding
          exactly — the mobile card list should sit the same distance from
          the screen edges there as it does here. md:p-[24px_28px]
          reasserts the original desktop value — padding has to be a
          className here, not inline style, since an inline style property
          always wins over any class regardless of breakpoint. */}
      <div className="page-content p-6 md:p-[24px_28px]" style={{ flex: 1 }}>
        {/* Period selector — plain links (no client JS needed) so the page
            stays a server component and each period gets its own cached
            entry (see getTopSales' unstable_cache above). */}
        <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
          {PERIODS.map((p) => (
            <Link
              key={p}
              href={p === "all" ? "/top-sales" : `/top-sales?period=${p}`}
              style={{
                padding: "6px 14px",
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
                textDecoration: "none",
                border: `1.5px solid ${period === p ? "#6366f1" : "var(--border)"}`,
                background: period === p ? "#6366f1" : "var(--bg)",
                color: period === p ? "#fff" : "var(--text)",
              }}
            >
              {PERIOD_LABELS[p]}
            </Link>
          ))}
        </div>

        {items.length === 0 ? (
          <div className="crm-card" style={{ padding: "64px 24px", textAlign: "center" }}>
            <TrendingUp size={48} style={{ color: "var(--text-muted)", margin: "0 auto 16px" }} />
            <p style={{ color: "var(--text-muted)", fontSize: 14 }}>Даних продажів ще немає</p>
          </div>
        ) : (
          <>
            {/* ── Mobile card list (< md) — a plain sibling of the desktop
                table's own card below, not nested inside a second outer
                card the way this used to be. Same page padding, same
                card-to-edge spacing as /returns' list. ────────────────── */}
            <div className="md:hidden space-y-3">
                {items.map((item) => {
                  const pct = Math.round((item.quantity / maxQty) * 100);
                  return (
                    <ProductQuickView
                      key={item.pid}
                      product={item.product}
                      quantity={item.quantity}
                      revenue={item.revenue}
                      rank={item.rank}
                      variant="card"
                    >
                      <div className="crm-card" style={{ padding: 14 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div
                            style={{
                              width: 28,
                              height: 28,
                              borderRadius: 8,
                              flexShrink: 0,
                              background: item.rank <= 3
                                ? `linear-gradient(135deg, ${["#f59e0b","#94a3b8","#92400e"][item.rank - 1]}, ${["#d97706","#64748b","#78350f"][item.rank - 1]})`
                                : "var(--bg)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: 12,
                              fontWeight: 800,
                              color: item.rank <= 3 ? "#fff" : "var(--text-muted)",
                            }}
                          >
                            {item.rank}
                          </div>
                          {item.product?.img ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={getImgUrl(item.product.img, "products")}
                              alt={item.product.title}
                              style={{ width: 36, height: 36, borderRadius: 8, objectFit: "cover", flexShrink: 0, background: "var(--bg)" }}
                            />
                          ) : (
                            <div
                              style={{
                                width: 36,
                                height: 36,
                                borderRadius: 8,
                                flexShrink: 0,
                                background: "var(--bg)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: 11,
                                color: "var(--text-muted)",
                              }}
                            >
                              —
                            </div>
                          )}
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {item.product?.title ?? `#${item.pid}`}
                            </div>
                            {item.product?.pcode && (
                              <div style={{ fontSize: 11.5, color: "var(--text-muted)", fontFamily: "monospace" }}>
                                {item.product.pcode}
                              </div>
                            )}
                          </div>
                        </div>

                        <div
                          style={{
                            display: "flex", alignItems: "center", justifyContent: "space-between",
                            marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--border)",
                          }}
                        >
                          <div>
                            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Продано</div>
                            <div style={{ fontWeight: 700, fontFamily: "monospace" }}>{item.quantity}</div>
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Виручка</div>
                            <div style={{ fontWeight: 700, fontFamily: "monospace", color: "var(--success)" }}>
                              {item.revenue.toLocaleString("uk-UA")} ₴
                            </div>
                          </div>
                        </div>

                        <div style={{ marginTop: 10 }}>
                          <div style={{ height: 6, borderRadius: 3, background: "var(--border)", overflow: "hidden" }}>
                            <div
                              style={{
                                height: "100%",
                                width: `${pct}%`,
                                background: "linear-gradient(90deg, #6366f1, #8b5cf6)",
                                borderRadius: 3,
                              }}
                            />
                          </div>
                          <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 2 }}>
                            {pct}%
                          </div>
                        </div>
                      </div>
                    </ProductQuickView>
                  );
                })}
              </div>

              {/* ── Desktop table (>= md) ────────────────────────────────── */}
              <div className="hidden md:block crm-card" style={{ overflowX: "auto" }}>
              <table className="crm-table">
                <thead>
                  <tr>
                    <th style={{ width: 48 }}>#</th>
                    <th>Товар</th>
                    <th style={{ textAlign: "right" }}>Продано</th>
                    <th style={{ textAlign: "right" }}>Виручка</th>
                    <th>Динаміка</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => {
                    const pct = Math.round((item.quantity / maxQty) * 100);
                    return (
                      <ProductQuickView
                        key={item.pid}
                        product={item.product}
                        quantity={item.quantity}
                        revenue={item.revenue}
                        rank={item.rank}
                      >
                        <td>
                          <div
                            style={{
                              width: 28,
                              height: 28,
                              borderRadius: 8,
                              background: item.rank <= 3
                                ? `linear-gradient(135deg, ${["#f59e0b","#94a3b8","#92400e"][item.rank - 1]}, ${["#d97706","#64748b","#78350f"][item.rank - 1]})`
                                : "var(--bg)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: 12,
                              fontWeight: 800,
                              color: item.rank <= 3 ? "#fff" : "var(--text-muted)",
                            }}
                          >
                            {item.rank}
                          </div>
                        </td>
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            {item.product?.img ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={getImgUrl(item.product.img, "products")}
                                alt={item.product.title}
                                style={{ width: 36, height: 36, borderRadius: 8, objectFit: "cover", flexShrink: 0, background: "var(--bg)" }}
                              />
                            ) : (
                              <div
                                style={{
                                  width: 36,
                                  height: 36,
                                  borderRadius: 8,
                                  flexShrink: 0,
                                  background: "var(--bg)",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  fontSize: 11,
                                  color: "var(--text-muted)",
                                }}
                              >
                                —
                              </div>
                            )}
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontWeight: 600 }}>
                                {item.product?.title ?? `#${item.pid}`}
                              </div>
                              {item.product?.pcode && (
                                <div style={{ fontSize: 11.5, color: "var(--text-muted)", fontFamily: "monospace" }}>
                                  {item.product.pcode}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td style={{ textAlign: "right", fontWeight: 700, fontFamily: "monospace" }}>
                          {item.quantity}
                        </td>
                        <td style={{ textAlign: "right", fontFamily: "monospace", color: "var(--success)", fontWeight: 600 }}>
                          {item.revenue.toLocaleString("uk-UA")} ₴
                        </td>
                        <td style={{ minWidth: 160 }}>
                          <div
                            style={{
                              height: 6,
                              borderRadius: 3,
                              background: "var(--border)",
                              overflow: "hidden",
                            }}
                          >
                            <div
                              style={{
                                height: "100%",
                                width: `${pct}%`,
                                background: "linear-gradient(90deg, #6366f1, #8b5cf6)",
                                borderRadius: 3,
                                transition: "width 0.6s ease",
                              }}
                            />
                          </div>
                          <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 2 }}>
                            {pct}%
                          </div>
                        </td>
                      </ProductQuickView>
                    );
                  })}
                </tbody>
              </table>
              </div>
            </>
          )}
      </div>
    </>
  );
}
