"use client";

import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

interface ChartData {
  day: string;
  orders: number;
  revenue: number;
}

interface StatusData {
  name: string;
  value: number;
}

const STATUS_PIE_COLORS = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"];

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

export function DashboardCharts({ chartData, statusData }: { chartData: ChartData[]; statusData: StatusData[] }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr 320px",
        gap: 16,
      }}
    >
      {/* Area chart — revenue */}
      <div
        className="crm-card animate-fade-in"
        style={{ padding: "20px", gridColumn: "1 / 3" }}
      >
        <div style={{ marginBottom: 16 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", margin: 0 }}>
            Виручка та замовлення
          </h3>
          <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "2px 0 0" }}>
            Останні 30 днів
          </p>
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="gradRevenue" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gradOrders" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="day"
              tick={{ fontSize: 10, fill: "var(--text-muted)" }}
              axisLine={false}
              tickLine={false}
              interval={4}
            />
            <YAxis
              yAxisId="revenue"
              orientation="left"
              tick={{ fontSize: 11, fill: "var(--text-muted)" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
            />
            <YAxis
              yAxisId="orders"
              orientation="right"
              tick={{ fontSize: 11, fill: "var(--text-muted)" }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={customTooltip} />
            <Area
              yAxisId="revenue"
              type="monotone"
              dataKey="revenue"
              name="Виручка"
              stroke="#6366f1"
              strokeWidth={2}
              fill="url(#gradRevenue)"
            />
            <Area
              yAxisId="orders"
              type="monotone"
              dataKey="orders"
              name="Замовлення"
              stroke="#10b981"
              strokeWidth={2}
              fill="url(#gradOrders)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Pie chart — order statuses */}
      <div className="crm-card animate-fade-in" style={{ padding: "20px" }}>
        <div style={{ marginBottom: 16 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", margin: 0 }}>
            Статуси замовлень
          </h3>
          <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "2px 0 0" }}>
            Розподіл
          </p>
        </div>
        {statusData.length > 0 ? (
          <>
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie
                  data={statusData}
                  cx="50%"
                  cy="50%"
                  innerRadius={42}
                  outerRadius={72}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {statusData.map((_, i) => (
                    <Cell key={i} fill={STATUS_PIE_COLORS[i % STATUS_PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip content={customTooltip} />
              </PieChart>
            </ResponsiveContainer>
            <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 8 }}>
              {statusData.map((s, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: STATUS_PIE_COLORS[i % STATUS_PIE_COLORS.length],
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ flex: 1, color: "var(--text-muted)", truncate: true } as any}>
                    {s.name}
                  </span>
                  <span style={{ fontWeight: 700, color: "var(--text)" }}>{s.value}</span>
                </div>
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

      {/* Bar chart — orders per day */}
      <div className="crm-card animate-fade-in" style={{ padding: "20px", gridColumn: "1 / -1" }}>
        <div style={{ marginBottom: 16 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", margin: 0 }}>
            Замовлення по днях
          </h3>
          <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "2px 0 0" }}>
            Останні 30 днів
          </p>
        </div>
        <ResponsiveContainer width="100%" height={140}>
          <BarChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barSize={10}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="day"
              tick={{ fontSize: 10, fill: "var(--text-muted)" }}
              axisLine={false}
              tickLine={false}
              interval={4}
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
      </div>
    </div>
  );
}
