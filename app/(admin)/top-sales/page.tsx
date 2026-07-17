import { Header } from "@/components/admin/header";
import { supabaseServer } from "@/lib/supabase";
import { getImgUrl } from "@/lib/utils";
import { TrendingUp } from "lucide-react";
import { ProductQuickView } from "./product-quick-view";

export const dynamic = "force-dynamic";

async function getTopSales() {
  const { data: items } = await supabaseServer
    .from("orders_item")
    .select("product, quantity, price");

  if (!items || items.length === 0) return [];

  const map: Record<number, { quantity: number; revenue: number }> = {};
  for (const item of items) {
    if (!map[item.product]) map[item.product] = { quantity: 0, revenue: 0 };
    map[item.product].quantity += item.quantity;
    map[item.product].revenue += item.price * item.quantity;
  }

  const sorted = Object.entries(map)
    .map(([pid, v]) => ({ pid: Number(pid), ...v }))
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 30);

  if (sorted.length === 0) return [];

  const pids = sorted.map((s) => s.pid);
  const { data: products } = await supabaseServer
    .from("products")
    .select("id, title, pcode, img, price, price_sale, active")
    .in("id", pids);

  const prodMap: Record<number, any> = {};
  for (const p of products || []) prodMap[p.id] = p;

  return sorted.map((s, i) => ({
    rank: i + 1,
    ...s,
    product: prodMap[s.pid],
  }));
}

export default async function TopSalesPage() {
  const items = await getTopSales();
  const maxQty = items[0]?.quantity ?? 1;

  return (
    <>
      <Header
        title="Топ продажів"
        subtitle="Найпопулярніші товари за кількістю продажів"
      />

      <div className="page-content" style={{ padding: "24px 28px", flex: 1 }}>
        <div className="crm-card">
          {items.length === 0 ? (
            <div style={{ padding: "64px 24px", textAlign: "center" }}>
              <TrendingUp size={48} style={{ color: "var(--text-muted)", margin: "0 auto 16px" }} />
              <p style={{ color: "var(--text-muted)", fontSize: 14 }}>Даних продажів ще немає</p>
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
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
          )}
        </div>
      </div>
    </>
  );
}
