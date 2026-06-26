import { Header } from "@/components/admin/header";
import { supabaseServer } from "@/lib/supabase";
import { ShoppingCart, Package, Users, FileText, TrendingUp, Warehouse } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { DashboardCharts } from "@/components/admin/dashboard-charts";
import { StatCard } from "@/components/admin/stat-card";
import { TranslateButton } from "@/components/admin/translate-button";

export const dynamic = "force-dynamic";

async function getStats() {
  const now = new Date();
  const monthAgo = new Date(now);
  monthAgo.setDate(monthAgo.getDate() - 30);

  /* Run independent queries in parallel */
  const [
    { count: productsCount },
    { count: ordersCount },
    { count: usersCount },
    { count: articlesCount },
    { data: recentOrderRows },
    { data: monthOrderRows },
    { data: warehousesRaw },
  ] = await Promise.all([
    supabaseServer.from("products").select("*", { count: "exact", head: true }).eq("lang", "uk"),
    supabaseServer.from("orders").select("*", { count: "exact", head: true }),
    supabaseServer.from("users").select("*", { count: "exact", head: true }),
    supabaseServer.from("articles").select("*", { count: "exact", head: true }).eq("lang", "uk"),
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

  const newOrders = recentOrders.filter(
    (o: any) => !o.status || o.status === "Получен"
  ).length;

  /* ── Revenue: sum all items from the last 30 days ── */
  const totalRevenue = (monthItems || []).reduce(
    (s: number, i: any) => s + Number(i.price) * Number(i.quantity),
    0
  );

  /* ── Build 30-day chart ── */
  /* Index: order id → date string "YYYY-MM-DD" */
  const orderDateMap: Record<number, string> = {};
  for (const o of monthOrderRows || []) {
    const day = o.date ? String(o.date).slice(0, 10) : null;
    if (day) orderDateMap[o.id] = day;
  }

  /* orders count per day */
  const ordersByDay: Record<string, number> = {};
  for (const o of monthOrderRows || []) {
    const day = orderDateMap[o.id];
    if (day) ordersByDay[day] = (ordersByDay[day] || 0) + 1;
  }

  /* revenue per day */
  const revenueByDay: Record<string, number> = {};
  for (const item of monthItems || []) {
    const day = orderDateMap[item.oid];
    if (!day) continue;
    revenueByDay[day] = (revenueByDay[day] || 0) + Number(item.price) * Number(item.quantity);
  }

  /* Generate one entry per calendar day for the last 30 days */
  const chartData = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(now);
    d.setDate(d.getDate() - (29 - i));
    const dayStr = d.toISOString().slice(0, 10);
    const label = d.toLocaleDateString("uk-UA", { day: "numeric", month: "short" });
    return {
      day: label,
      orders: ordersByDay[dayStr] ?? 0,
      revenue: Math.round(revenueByDay[dayStr] ?? 0),
    };
  });

  /* ── Status breakdown (last 30 days) ── */
  const statusMap: Record<string, number> = {};
  for (const o of monthOrderRows || []) {
    const s = (o.status as string) || "Новий";
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
    chartData,
    statusData,
    warehouses: warehousesRaw || [],
  };
}

const STATUS_COLORS: Record<string, string> = {
  "Новий":       "badge-blue",
  "Получен":     "badge-blue",
  "В обробці":   "badge-amber",
  "Відправлений":"badge-purple",
  "Виконаний":   "badge-green",
  "Скасований":  "badge-red",
};

export default async function DashboardPage() {
  const {
    productsCount, ordersCount, usersCount, articlesCount,
    recentOrders, newOrders, totalRevenue, chartData, statusData, warehouses,
  } = await getStats();

  const stats = [
    {
      label: "Товарів",
      value: productsCount.toLocaleString("uk-UA"),
      icon: Package,
      gradient: "stat-indigo",
      trend: null,
      sub: "в каталозі (uk)",
    },
    {
      label: "Замовлень",
      value: ordersCount.toLocaleString("uk-UA"),
      icon: ShoppingCart,
      gradient: "stat-emerald",
      trend: newOrders > 0 ? { label: `${newOrders} нових`, up: true } : null,
      sub: "всього",
    },
    {
      label: "Клієнтів",
      value: usersCount.toLocaleString("uk-UA"),
      icon: Users,
      gradient: "stat-purple",
      trend: null,
      sub: "зареєстровано",
    },
    {
      label: "Дохід (30 днів)",
      value: `${Math.round(totalRevenue).toLocaleString("uk-UA")} ₴`,
      icon: TrendingUp,
      gradient: "stat-amber",
      trend: null,
      sub: "сума по позиціях замовлень",
    },
    {
      label: "Статей",
      value: articlesCount.toLocaleString("uk-UA"),
      icon: FileText,
      gradient: "stat-cyan",
      trend: null,
      sub: "опубліковано",
    },
    {
      label: "Складів",
      value: warehouses.length.toString(),
      icon: Warehouse,
      gradient: "stat-rose",
      trend: null,
      sub: "активних",
    },
  ];

  return (
    <>
      <Header title="Дашборд" subtitle="Загальна статистика та аналітика" actions={<TranslateButton />} />
      <div className="page-content" style={{ padding: "24px 28px", flex: 1 }}>

        {/* KPI Cards */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
            gap: 16,
            marginBottom: 24,
          }}
        >
          {stats.map((s, i) => (
            <StatCard key={i} {...s} />
          ))}
        </div>

        {/* Charts */}
        <DashboardCharts chartData={chartData} statusData={statusData} />

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

          <div style={{ overflowX: "auto" }}>
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
                  const statusClass = STATUS_COLORS[order.status] ?? "badge-gray";
                  return (
                    <tr key={order.id}>
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
                        <span className={`badge ${statusClass}`}>{order.status ?? "Новий"}</span>
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
