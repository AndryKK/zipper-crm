import { Header } from "@/components/admin/header";
import { supabaseServer } from "@/lib/supabase";
import { ShoppingCart, Package, Users, FileText, TrendingUp, Warehouse } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { DashboardCharts } from "@/components/admin/dashboard-charts";
import { StatCard } from "@/components/admin/stat-card";
import { TranslateButton } from "@/components/admin/translate-button";
import { unstable_cache } from "next/cache";
import { orderStatusLabel, orderStatusClass, orderRowClass, isNewStatus, ORDER_STATUSES } from "@/lib/order-status";

// This is the CRM's most-visited page — force-dynamic meant every single
// visit re-ran all these queries from scratch, including a full fetch of
// every order (and every one of THEIR order_item rows) from the last 30
// days. Wrapped in unstable_cache so repeat visits within the window reuse
// the same result instead of re-querying — most of this dashboard doesn't
// need to be second-by-second fresh.
//
// The status pie and the recent-orders table are the two exceptions —
// "виправ швидкість оновлення" — a manager watching either one right after
// changing an order's status found the 120s cache window too slow to
// reflect it. Both are deliberately kept OUT of this cached function and
// queried live on every request instead (getStatusData/getRecentOrders
// below): each is a small, cheap query on its own (last 7 days' worth of
// order statuses; the 10 newest orders), so querying them uncached doesn't
// meaningfully add to Supabase egress the way re-running the other 30-day/
// catalog-wide queries on every visit used to.
const getStats = unstable_cache(_getStats, ["dashboard-stats"], { revalidate: 120 });

// Legacy data has old/Russian status text mixed in with the current
// Ukrainian pipeline (e.g. imported orders from before the CHAR-padding
// fix): "Завершен"/"Завершено" are the same state, just spelled
// differently depending on where the row came from. Normalize before
// counting so the pie chart doesn't split one real status into two
// differently-colored slices. "Новий"-like statuses (null, "new",
// "Отримано"/"Получен" — the storefront's "we received the order", not a
// distinct pipeline stage) are bucketed via isNewStatus(), the same check
// used everywhere else a status is shown (recent-orders list below,
// /orders, the order-detail page) — this used to be a separate exact-match
// table that didn't cover "Отримано"/"Получен", so an order in that state
// silently miscounted as "Завершено" instead of "Новий".
const STATUS_DISPLAY: Record<string, string> = {
  "Завершен": "Завершено",
  "В работе": "В роботі",
};

async function _getStats() {
  const now = new Date();
  const monthAgo = new Date(now);
  monthAgo.setDate(monthAgo.getDate() - 30);

  /* Run independent queries in parallel */
  const [
    { count: productsCount },
    { count: ordersCount },
    { count: usersCount },
    { count: articlesCount },
    { count: newOrdersCount },
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
    /* ALL orders in the last 30 days for the revenue chart */
    supabaseServer
      .from("orders")
      .select("id")
      .gte("date", monthAgo.toISOString()),
    supabaseServer.from("warehouses").select("id, title").eq("active", 1).order("priority"),
  ]);

  /* Fetch order items for month orders (revenue chart) */
  const monthIds = (monthOrderRows || []).map((o: any) => o.id);
  const { data: monthItems } = monthIds.length > 0
    ? await supabaseServer.from("orders_item").select("oid, price, quantity").in("oid", monthIds)
    : { data: [] };

  const newOrders = newOrdersCount ?? 0;

  /* ── Revenue: sum all items from the last 30 days ── */
  const totalRevenue = (monthItems || []).reduce(
    (s: number, i: any) => s + Number(i.price) * Number(i.quantity),
    0
  );

  return {
    productsCount: productsCount ?? 0,
    ordersCount: ordersCount ?? 0,
    usersCount: usersCount ?? 0,
    articlesCount: articlesCount ?? 0,
    newOrders,
    totalRevenue,
    warehouses: warehousesRaw || [],
    warehousesCount: (warehousesRaw || []).length,
  };
}

// Deliberately NOT wrapped in unstable_cache — see getStats' own comment.
// Cheap on its own (LIMIT 10 + one items query keyed to just those ids), so
// querying it live on every dashboard visit doesn't add meaningful load.
async function getRecentOrders() {
  const { data: recentOrderRows } = await supabaseServer
    .from("orders")
    .select("id, date, status, person, login, phone, addr_delivery")
    .order("date", { ascending: false })
    .limit(10);

  const recentIds = (recentOrderRows || []).map((o: any) => o.id);
  const { data: recentItems } = recentIds.length > 0
    ? await supabaseServer.from("orders_item").select("oid, price, quantity").in("oid", recentIds)
    : { data: [] };

  return (recentOrderRows || []).map((o: any) => ({
    ...o,
    items: (recentItems || []).filter((i: any) => i.oid === o.id),
  }));
}

// Deliberately NOT wrapped in unstable_cache — see getStats' own comment.
// Queries only the last 7 days' status column directly (not the 30-day
// order set the revenue card needs), so it's a small, cheap query on its
// own even run live on every visit.
async function getStatusData() {
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  const { data: weekOrderRows } = await supabaseServer
    .from("orders")
    .select("status")
    .gte("date", weekAgo.toISOString());

  // STATUS_DISPLAY defined at module scope above — legacy old/Russian
  // status text mixed in with the current Ukrainian pipeline.
  const statusMap: Record<string, number> = {};
  for (const o of weekOrderRows || []) {
    const raw = (o.status as string) || "";
    const s = isNewStatus(raw) ? "Новий" : (STATUS_DISPLAY[raw] ?? raw);
    statusMap[s] = (statusMap[s] || 0) + 1;
  }
  // Always all six canonical statuses, in pipeline order, even ones with
  // zero orders this week — a manager scanning the legend for "how many
  // are still Відправлено" shouldn't have that row silently vanish just
  // because it happens to be 0 right now, and the fixed order stops rows
  // jumping around week to week.
  return ORDER_STATUSES.map((name) => ({ name, value: statusMap[name] ?? 0 }));
}

export default async function DashboardPage() {
  const [
    { productsCount, ordersCount, usersCount, articlesCount, newOrders, totalRevenue, warehouses, warehousesCount },
    recentOrders,
    statusData,
  ] = await Promise.all([getStats(), getRecentOrders(), getStatusData()]);

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

        {/* KPI Cards — fixed column counts (1/2/3), not an auto-fill/
            minmax grid: auto-fill packs as many fixed-width columns as fit
            the container, which for exactly 6 cards produced an uneven
            "5 then 1 orphaned card" row at some widths. 1/2/3 always
            divides 6 evenly (6 stacked, 3 rows of 2, or 2 rows of 3), so
            every row is balanced at every breakpoint. */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 md:gap-4 mb-5 md:mb-6">
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
