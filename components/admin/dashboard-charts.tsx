"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Area, ComposedChart, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

interface StatusData {
  name: string;
  value: number;
}

interface Bucket {
  label: string;
  ru: number; ruRevenue: number;
  ua: number; uaRevenue: number;
  premium: number; premiumRevenue: number;
  orders: number; revenue: number;
}

// Fixed per status name (not per array index, which the previous version
// used — a slice's color used to depend on where it landed after sorting
// by count, so "Завершено" could be indigo one week and green the next).
// Same hex values as PIPELINE/ALL_STATUSES in
// app/(admin)/orders/[id]/page.tsx, so this chart's colors mean the same
// thing everywhere else in the app already uses them.
const STATUS_PIE_COLORS: Record<string, string> = {
  "Новий":       "#6b7280",
  "В роботі":    "#d97706",
  "Оплачено":    "#2563eb",
  "Відправлено": "#7c3aed",
  "Завершено":   "#059669",
  "Скасовано":   "#dc2626",
};
const FALLBACK_PIE_COLOR = "#94a3b8";

// RU = zipper.in.ua (Russian-language site), UA = zipper.com.ua
// (Ukrainian-language site), Premium = Zipper Premium (zipper-new-shop) —
// site attribution logic mirrors app/(admin)/orders/page.tsx's "Сайт" badge.
const SITE_COLORS = { ru: "#dc2626", ua: "#facc15", premium: "#b45309" } as const;
const SITE_LABELS = { ru: "RU · zipper.in.ua", ua: "UA · zipper.com.ua", premium: "Premium · Zipper Premium" } as const;

const PERIODS: { key: string; label: string }[] = [
  { key: "day", label: "День" },
  { key: "week", label: "Тиждень" },
  { key: "month", label: "Місяць" },
  { key: "year", label: "Рік" },
  { key: "all", label: "Весь час" },
];

const customTooltip = (props: any) => {
  const { active, payload, label } = props;
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        padding: "10px 14px",
        boxShadow: "var(--shadow)",
      }}
    >
      <p style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6 }}>{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ fontSize: 13, fontWeight: 600, color: p.color, margin: "2px 0" }}>
          {p.name}: {typeof p.value === "number" && p.name.toLowerCase().includes("виручк")
            ? `${p.value.toLocaleString("uk-UA")} ₴`
            : p.value}
        </p>
      ))}
    </div>
  );
};

function PeriodToggle({ period, onChange }: { period: string; onChange: (p: string) => void }) {
  return (
    <div style={{ display: "flex", gap: 4, background: "var(--bg)", borderRadius: 8, padding: 3, flexWrap: "wrap" }}>
      {PERIODS.map((p) => (
        <button
          key={p.key}
          onClick={() => onChange(p.key)}
          style={{
            padding: "5px 10px",
            fontSize: 12,
            fontWeight: 600,
            borderRadius: 6,
            border: "none",
            cursor: "pointer",
            background: period === p.key ? "var(--accent)" : "transparent",
            color: period === p.key ? "#fff" : "var(--text-muted)",
            transition: "background 0.15s",
          }}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}

const METRICS: { key: "revenue" | "orders"; label: string }[] = [
  { key: "revenue", label: "Виручка" },
  { key: "orders", label: "Замовлення" },
];

function MetricToggle({ metric, onChange }: { metric: "revenue" | "orders"; onChange: (m: "revenue" | "orders") => void }) {
  return (
    <div style={{ display: "flex", gap: 4, background: "var(--bg)", borderRadius: 8, padding: 3, flexWrap: "wrap" }}>
      {METRICS.map((m) => (
        <button
          key={m.key}
          onClick={() => onChange(m.key)}
          style={{
            padding: "5px 10px",
            fontSize: 12,
            fontWeight: 600,
            borderRadius: 6,
            border: "none",
            cursor: "pointer",
            background: metric === m.key ? "var(--accent)" : "transparent",
            color: metric === m.key ? "#fff" : "var(--text-muted)",
            transition: "background 0.15s",
          }}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}

export function DashboardCharts({ statusData }: { statusData: StatusData[] }) {
  const router = useRouter();
  // /orders' own STATUS_FILTER_CLAUSES (app/api/orders/route.ts) matches
  // this chart's exact grouping (STATUS_DISPLAY in app/(admin)/page.tsx),
  // and days=7 matches the "Розподіл за останні 7 днів" window this chart
  // itself counts within — together they land on precisely the orders
  // this slice/legend row counted, not a differently-drawn subset (e.g.
  // every order of that status ever, which without days= was 20,000+
  // instead of the single-digit count shown here).
  const goToStatus = (name: string) => router.push(`/orders?status=${encodeURIComponent(name)}&days=7`);

  const [period, setPeriod] = useState("month");
  const [metric, setMetric] = useState<"revenue" | "orders">("revenue");
  const [buckets, setBuckets] = useState<Bucket[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (p: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/dashboard/chart?period=${p}`);
      const data = await res.json();
      setBuckets(data.buckets ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(period); }, [period, load]);

  return (
    // Single column and stacked on phone, back to the 2/3 + 1/3 layout
    // from `lg` up — the fixed "1fr 1fr 320px" this used to be never
    // shrank below ~660px combined, forcing horizontal scroll well before
    // tablet width.
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 md:gap-4">
      {/* Area/line chart — revenue & orders per site */}
      <div className="crm-card animate-fade-in p-4 md:p-5 lg:col-span-2">
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
          <div>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", margin: 0 }}>
              Виручка та замовлення
            </h3>
            <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "2px 0 0" }}>
              Накладені графіки по 3 сайтах
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <MetricToggle metric={metric} onChange={setMetric} />
            <PeriodToggle period={period} onChange={setPeriod} />
          </div>
        </div>
        {loading ? (
          <div style={{ height: 200, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontSize: 13 }}>
            Завантаження...
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <ComposedChart data={buckets} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="gradRu" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={SITE_COLORS.ru} stopOpacity={0.35} />
                  <stop offset="95%" stopColor={SITE_COLORS.ru} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradUa" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={SITE_COLORS.ua} stopOpacity={0.35} />
                  <stop offset="95%" stopColor={SITE_COLORS.ua} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradPremium" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={SITE_COLORS.premium} stopOpacity={0.35} />
                  <stop offset="95%" stopColor={SITE_COLORS.premium} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: "var(--text-muted)" }}
                axisLine={false}
                tickLine={false}
                interval={Math.max(0, Math.floor(buckets.length / 8) - 1)}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "var(--text-muted)" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => (metric === "revenue" ? `${(v / 1000).toFixed(0)}k` : v)}
                allowDecimals={false}
              />
              <Tooltip content={customTooltip} />
              <Area
                type="monotone"
                dataKey={metric === "revenue" ? "ruRevenue" : "ru"}
                name={metric === "revenue" ? "Виручка RU" : "Замовлення RU"}
                stroke={SITE_COLORS.ru} strokeWidth={2} fill="url(#gradRu)"
              />
              <Area
                type="monotone"
                dataKey={metric === "revenue" ? "uaRevenue" : "ua"}
                name={metric === "revenue" ? "Виручка UA" : "Замовлення UA"}
                stroke={SITE_COLORS.ua} strokeWidth={2} fill="url(#gradUa)"
              />
              <Area
                type="monotone"
                dataKey={metric === "revenue" ? "premiumRevenue" : "premium"}
                name={metric === "revenue" ? "Виручка Premium" : "Замовлення Premium"}
                stroke={SITE_COLORS.premium} strokeWidth={2} fill="url(#gradPremium)"
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
        {/* Explanation legend */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
          {(Object.keys(SITE_COLORS) as (keyof typeof SITE_COLORS)[]).map((site) => (
            <div key={site} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "var(--text-muted)" }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: SITE_COLORS[site], flexShrink: 0 }} />
              {SITE_LABELS[site]}
            </div>
          ))}
        </div>
      </div>

      {/* Pie chart — order statuses */}
      <div className="crm-card animate-fade-in p-4 md:p-5">
        <div style={{ marginBottom: 16 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", margin: 0 }}>
            Статуси замовлень
          </h3>
          <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "2px 0 0" }}>
            Розподіл за останні 7 днів
          </p>
        </div>
        {/* statusData always has all six statuses now (some can be 0) so
            the list always shows every status — but the pie/legend pair
            as a whole should still fall back to "Немає даних" when every
            one of them is 0, not render an empty ring. */}
        {statusData.some((s) => s.value > 0) ? (
          <>
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie
                  // Only non-zero slices in the ring itself — a 0-value
                  // entry would still claim a sliver of paddingAngle,
                  // drawing a stray gap for a status that has nothing to
                  // show. The legend below lists all six regardless.
                  data={statusData.filter((s) => s.value > 0)}
                  cx="50%"
                  cy="50%"
                  innerRadius={42}
                  outerRadius={72}
                  paddingAngle={3}
                  dataKey="value"
                  onClick={(entry) => goToStatus((entry as unknown as StatusData).name)}
                  style={{ cursor: "pointer" }}
                >
                  {statusData.filter((s) => s.value > 0).map((s, i) => (
                    <Cell key={i} fill={STATUS_PIE_COLORS[s.name] ?? FALLBACK_PIE_COLOR} />
                  ))}
                </Pie>
                <Tooltip content={customTooltip} />
              </PieChart>
            </ResponsiveContainer>
            <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 8 }}>
              {statusData.map((s, i) => (
                <button
                  key={i}
                  onClick={() => goToStatus(s.name)}
                  title={`Переглянути замовлення зі статусом «${s.name}»`}
                  style={{
                    display: "flex", alignItems: "center", gap: 8, fontSize: 12,
                    background: "none", border: "none", padding: "2px 0", width: "100%",
                    cursor: "pointer", textAlign: "left", font: "inherit", color: "inherit",
                  }}
                >
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: STATUS_PIE_COLORS[s.name] ?? FALLBACK_PIE_COLOR,
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ flex: 1, color: "var(--text-muted)", truncate: true } as any}>
                    {s.name}
                  </span>
                  <span style={{ fontWeight: 700, color: "var(--text)" }}>{s.value}</span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <div
            style={{
              height: 200,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--text-muted)",
              fontSize: 13,
            }}
          >
            Немає даних
          </div>
        )}
      </div>

      {/* Bar chart — orders per bucket (all sites combined) */}
      <div className="crm-card animate-fade-in p-4 md:p-5 lg:col-span-3">
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
          <div>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", margin: 0 }}>
              Замовлення по днях
            </h3>
            <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "2px 0 0" }}>
              Сумарно з усіх сайтів
            </p>
          </div>
          <PeriodToggle period={period} onChange={setPeriod} />
        </div>
        {loading ? (
          <div style={{ height: 140, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontSize: 13 }}>
            Завантаження...
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={buckets} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barSize={10}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: "var(--text-muted)" }}
                axisLine={false}
                tickLine={false}
                interval={Math.max(0, Math.floor(buckets.length / 10) - 1)}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "var(--text-muted)" }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
              />
              <Tooltip content={customTooltip} />
              <Bar dataKey="orders" name="Замовлення" fill="#6366f1" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
