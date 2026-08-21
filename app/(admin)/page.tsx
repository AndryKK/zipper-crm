import { Header } from "@/components/admin/header";
import { supabaseServer } from "@/lib/supabase";
import { ShoppingCart, Package, Users, FileText, TrendingUp, Warehouse } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { DashboardCharts } from "@/components/admin/dashboard-charts";
import { StatCard } from "@/components/admin/stat-card";
import { TranslateButton } from "@/components/admin/translate-button";
import { unstable_cache } from "next/cache";
import { orderStatusLabel, orderStatusClass, orderRowClass } from "@/lib/order-status";

// This is the CRM's most-visited page — force-dynamic meant every single
// visit re-ran all 11 queries below from scratch, including a full fetch of
// every order (and every one of THEIR order_item rows) from the last 30
// days. Wrapped in unstable_cache so repeat visits within the window reuse
// the same result instead of re-querying — dashboard stats don't need to be
// second-by-second fresh.
const getStats = unstable_cache(_getStats, ["dashboard-stats"], { revalidate: 120 });

// Legacy data has old/Russian status text mixed in with the current
// Ukrainian pipeline (e.g. imported orders from before the CHAR-padding
// fix): "Завершен"/"Завершено" are the same state, just spelled
// differently depending on where the row came from. Normalize before
// counting so the pie chart doesn't split one real status into two
// differently-colored slices. The recent-orders list below does NOT use
// this — it renders each order's raw status through the exact same
// orderStatusLabel/orderStatusClass/orderRowClass (lib/order-status.ts)
// the real /orders list uses, so a card/row here is colored identically
// to the matching row there, including that page's own (different, older)
// take on "Отримано"/"Получен" — not a second, competing interpretation.
const STATUS_DISPLAY: Record<string, string> = {
  "Завершен": "Завершено",
  "Отримано": "Завершено",
  "Получен": "Завершено",
  "В работе": "В роботі",
  "new": "Новий",
};

async function _getStats() {
  const now = new Date();
  const monthAgo = new Date(now);
  monthAgo.setDate(monthAgo.getDate() - 30);
  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 7);

  /* Run independent queries in parallel */
  const [
    { count: productsCount },
    { count: ordersCount },
    { count: usersCount },
    { count: articlesCount },
    { count: newOrdersCount },
    { data: recentOrderRows },
    { data: monthOrderRows },
    { data: warehousesRaw },
  ] = await Promise.all([
    supabaseServer.from("products").select("*", { count: "exact", head: true }).eq("lang", "uk"),
    supabaseServer.from("orders").select("*", { count: "exact", head: true }),
    supabaseServer.from("users").select("*", { count: "exact", head: true }),
    supabaseServer.from("articles").select("*", { count: "exact", head: true }).eq("lang", "uk"),
    /* Orders with status "Нове" only */
    supabaseServer
      .from("orders")
      .select("*", { count: "exact", head: true })
      .eq("status", "Нове"),
    /* last 10 rows for the table display */
    supabaseServer
      .from("orders")
      .select("id, date, status, person, login, phone, addr_delivery")
      .order("date", { ascending: false })
      .limit(10),
    /* ALL orders in the last 30 days for chart + revenue */
    supabaseServer
      .from("orders")
      .select("id, date, status")
      .gte("date", monthAgo.toISOString())
      .order("date", { ascending: true }),
    supabaseServer.from("warehouses").select("id, title").eq("active", 1).order("priority"),
  ]);

  /* Fetch order items for recent table (to show totals) */
  const recentIds = (recentOrderRows || []).map((o: any) => o.id);
  const { data: recentItems } = recentIds.length > 0
    ? await supabaseServer.from("orders_item").select("oid, price, quantity").in("oid", recentIds)
    : { data: [] };

  /* Fetch order items for month orders (revenue chart) */
  const monthIds = (monthOrderRows || []).map((o: any) => o.id);
  const { data: monthItems } = monthIds.length > 0
    ? await supabaseServer.from("orders_item").select("oid, price, quantity").in("oid", monthIds)
    : { data: [] };

  /* ── Recent orders table ── */
  const recentOrders = (recentOrderRows || []).map((o: any) => ({
    ...o,
    items: (recentItems || []).filter((i: any) => i.oid === o.id),
  }));

  const newOrders = newOrdersCount ?? 0;

  /* ── Revenue: sum all items from the last 30 days ── */
  const totalRevenue = (monthItems || []).reduce(
    (s: number, i: any) => s + Number(i.price) * Number(i.quantity),
    0
  );

  /* ── Status breakdown (last 7 days) ── (STATUS_DISPLAY defined at
     module scope above — shared with recentOrders' normalization). */
  // Reuses monthOrderRows (last 30 days, already fetched for the revenue
  // card) filtered down to 7 — no need for a second query since 7 days is
  // a subset of what's already in memory.
  const statusMap: Record<string, number> = {};
  for (const o of monthOrderRows || []) {
    if (new Date(o.date as string) < weekAgo) continue;
    const raw = (o.status as string) || "Новий";
    const s = STATUS_DISPLAY[raw] ?? raw;
    statusMap[s] = (statusMap[s] || 0) + 1;
  }
  const statusData = Object.entries(statusMap)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  return {
    productsCount: productsCount ?? 0,
    ordersCount: ordersCount ?? 0,
    usersCount: usersCount ?? 0,
    articlesCount: articlesCount ?? 0,
    recentOrders,
    newOrders,
    totalRevenue,
    statusData,
    warehouses: warehousesRaw || [],
    warehousesCount: (warehousesRaw || []).length,
  };
}

export default async function DashboardPage() {
  const {
    productsCount, ordersCount, usersCount, articlesCount,
    recentOrders, newOrders, totalRevenue, statusData, warehouses, warehousesCount,
  } = await getStats();

  const stats = [
    {
      label: "Товарів",
      value: productsCount.toLocaleString("uk-UA"),
      icon: Package,
      gradient: "stat-indigo",
      trend: null,
      sub: "в каталозі (uk)",
      href: "/products",
    },
    {
      label: "Замовлень",
      value: ordersCount.toLocaleString("uk-UA"),
      icon: ShoppingCart,
      gradient: "stat-emerald",
      trend: newOrders > 0 ? { label: `${newOrders} нових`, up: true } : null,
      sub: "всього",
      href: "/orders",
    },
    {
      label: "Клієнтів",
      value: usersCount.toLocaleString("uk-UA"),
      icon: Users,
      gradient: "stat-purple",
      trend: null,
      sub: "зареєстровано",
      href: "/users",
    },
    {
      label: "Дохід (30 днів)",
      value: `${Math.round(totalRevenue).toLocaleString("uk-UA")} ₴`,
      icon: TrendingUp,
      gradient: "stat-amber",
      trend: null,
      sub: "сума по позиціях замовлень",
      href: "/orders",
    },
    {
      label: "Статей",
      value: articlesCount.toLocaleString("uk-UA"),
      icon: FileText,
      gradient: "stat-cyan",
      trend: null,
      sub: "опубліковано",
      href: "/articles",
    },
    {
      label: "Складів",
      value: warehousesCount.toString(),
      icon: Warehouse,
      gradient: "stat-rose",
      trend: null,
      sub: "активних",
      href: "/warehouses",
    },
  ];

  return (
    <>
      <Header title="Дашборд" subtitle="Загальна статистика та аналітика" actions={<TranslateButton />} />
      <div className="page-content p-4 md:p-6" style={{ flex: 1 }}>

        {/* KPI Cards — one column on phone (compact, stacked), same
            auto-fill grid from `sm` up. */}
        <div className="grid grid-cols-1 sm:[grid-template-columns:repeat(auto-fill,minmax(220px,1fr))] gap-3 md:gap-4 mb-5 md:mb-6">
          {stats.map((s, i) => (
            <StatCard key={i} {...s} />
          ))}
        </div>

        {/* Charts */}
        <DashboardCharts statusData={statusData} />

        {/* Recent orders table */}
        <div className="crm-card" style={{ marginTop: 20 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "16px 20px 12px",
              borderBottom: "1px solid var(--border)",
            }}
          >
            <div>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", margin: 0 }}>
                Останні замовлення
              </h2>
              <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "2px 0 0" }}>
                10 найновіших
              </p>
            </div>
            <a href="/orders" className="btn-ghost" style={{ fontSize: 12 }}>
              Всі замовлення →
            </a>
          </div>

          {/* ── Mobile cards (< md) — left color stripe matches the
              status, same colors as the desktop badge below.
              display:flex lives on the inner div, not here — an inline
              style="display:..." on the same element as md:hidden always
              wins over that class's @media rule (learned this the first
              time on the orders-detail items table). ──────── */}
          <div className="md:hidden">
          <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
            {recentOrders.length === 0 ? (
              <div style={{ textAlign: "center", padding: "36px 0", color: "var(--text-muted)", fontSize: 13 }}>
                Замовлень ще немає
              </div>
            ) : (
              recentOrders.map((order: any) => {
                const total = (order.items || []).reduce(
                  (s: number, i: any) => s + Number(i.price) * Number(i.quantity),
                  0
                );
                return (
                  <a
                    key={order.id}
                    href={`/orders/${order.id}`}
                    // crm-card sets the default background (same class
                    // the real /orders list's own mobile cards use); the
                    // order-row--* class (same one that page's table rows
                    // use) overrides it when this status is one of the
                    // three that get a tint there — no separate color
                    // scheme invented just for cards.
                    className={`crm-card ${orderRowClass(order.status)}`}
                    style={{
                      display: "block", padding: "12px 14px", borderRadius: 10,
                      border: "1px solid var(--border)", textDecoration: "none", color: "inherit",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
                      <span className="font-mono" style={{ color: "var(--accent)", fontWeight: 600, fontSize: 12.5 }}>
                        #{order.id}
                      </span>
                      <span className={orderStatusClass(order.status)}>{orderStatusLabel(order.status)}</span>
                    </div>
                    <div style={{ fontWeight: 500, fontSize: 13.5 }}>{order.person ?? order.login ?? "—"}</div>
                    {order.phone && (
                      <div style={{ color: "var(--text-muted)", fontSize: 12.5, marginTop: 2 }}>{order.phone}</div>
                    )}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
                      <span style={{ color: "var(--text-muted)", fontSize: 12 }}>{formatDate(order.date)}</span>
                      <span style={{ fontWeight: 700 }}>{total.toFixed(2)} ₴</span>
                    </div>
                  </a>
                );
              })
            )}
          </div>
          </div>

          {/* ── Desktop table (>= md) ─────────────────────────────────── */}
          <div className="hidden md:block" style={{ overflowX: "auto" }}>
            <table className="crm-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Клієнт</th>
                  <th>Телефон</th>
                  <th>Сума</th>
                  <th>Дата</th>
                  <th>Статус</th>
                </tr>
              </thead>
              <tbody>
                {recentOrders.map((order: any) => {
                  const total = (order.items || []).reduce(
                    (s: number, i: any) => s + Number(i.price) * Number(i.quantity),
                    0
                  );
                  return (
                    // Same order-row--* class the real /orders table uses
                    // (per this page's own .crm-table CSS, it targets
                    // `tr.order-row--*`) — so a row here is tinted exactly
                    // like the matching row there, not just similarly.
                    <tr key={order.id} className={orderRowClass(order.status)}>
                      <td>
                        <a
                          href={`/orders/${order.id}`}
                          style={{ fontFamily: "monospace", color: "var(--accent)", fontWeight: 600, fontSize: 12.5 }}
                        >
                          #{order.id}
                        </a>
                      </td>
                      <td style={{ fontWeight: 500 }}>{order.person ?? order.login ?? "—"}</td>
                      <td style={{ color: "var(--text-muted)" }}>{order.phone ?? "—"}</td>
                      <td style={{ fontWeight: 700 }}>{total.toFixed(2)} ₴</td>
                      <td style={{ color: "var(--text-muted)", fontSize: 12.5 }}>{formatDate(order.date)}</td>
                      <td>
                        <span className={orderStatusClass(order.status)}>{orderStatusLabel(order.status)}</span>
                      </td>
                    </tr>
                  );
                })}
                {recentOrders.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ textAlign: "center", padding: "48px 0", color: "var(--text-muted)" }}>
                      Замовлень ще немає
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
