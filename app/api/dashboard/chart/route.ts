import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";

type Period = "day" | "week" | "month" | "year" | "all";

const PERIOD_CONFIG: Record<Period, { bucketUnit: string; daysBack: number | null }> = {
  day: { bucketUnit: "hour", daysBack: 1 },
  week: { bucketUnit: "day", daysBack: 7 },
  month: { bucketUnit: "day", daysBack: 30 },
  year: { bucketUnit: "month", daysBack: 365 },
  all: { bucketUnit: "year", daysBack: null },
};

function bucketKey(d: Date, unit: string): string {
  if (unit === "hour") return d.toISOString().slice(0, 13);
  if (unit === "day") return d.toISOString().slice(0, 10);
  if (unit === "month") return d.toISOString().slice(0, 7);
  return d.toISOString().slice(0, 4);
}

function bucketLabel(d: Date, unit: string): string {
  if (unit === "hour") return d.toLocaleTimeString("uk-UA", { hour: "2-digit" });
  if (unit === "day") return d.toLocaleDateString("uk-UA", { day: "numeric", month: "short" });
  if (unit === "month") return d.toLocaleDateString("uk-UA", { month: "short", year: "2-digit" });
  return d.toLocaleDateString("uk-UA", { year: "numeric" });
}

// Builds the full list of expected buckets (including empty ones) between
// `start` and now, at `unit` granularity — same "always show every point"
// approach as the original 30-day chart in app/(admin)/page.tsx.
function buildBucketTimeline(start: Date, unit: string): { key: string; label: string; date: Date }[] {
  const out: { key: string; label: string; date: Date }[] = [];
  const now = new Date();
  const cursor = new Date(start);
  if (unit === "hour") cursor.setMinutes(0, 0, 0);
  else if (unit === "day") cursor.setHours(0, 0, 0, 0);
  else if (unit === "month") { cursor.setDate(1); cursor.setHours(0, 0, 0, 0); }
  else { cursor.setMonth(0, 1); cursor.setHours(0, 0, 0, 0); }

  while (cursor <= now) {
    out.push({ key: bucketKey(cursor, unit), label: bucketLabel(cursor, unit), date: new Date(cursor) });
    if (unit === "hour") cursor.setHours(cursor.getHours() + 1);
    else if (unit === "day") cursor.setDate(cursor.getDate() + 1);
    else if (unit === "month") cursor.setMonth(cursor.getMonth() + 1);
    else cursor.setFullYear(cursor.getFullYear() + 1);
  }
  return out;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const period = (searchParams.get("period") as Period) || "month";
  const config = PERIOD_CONFIG[period] ?? PERIOD_CONFIG.month;

  let start: Date;
  if (config.daysBack) {
    start = new Date();
    start.setDate(start.getDate() - config.daysBack);
  } else {
    // "all" — earliest order in the system, found once rather than hardcoded.
    const { data: earliest } = await supabaseServer
      .from("orders")
      .select("date")
      .order("date", { ascending: true })
      .limit(1)
      .single();
    start = earliest?.date ? new Date(earliest.date) : new Date("2017-01-01");
  }

  const { data, error } = await supabaseServer.rpc("get_dashboard_chart_buckets", {
    p_start: start.toISOString(),
    p_bucket_unit: config.bucketUnit,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const timeline = buildBucketTimeline(start, config.bucketUnit);
  const bySite: Record<string, Map<string, { orders: number; revenue: number }>> = {
    ru: new Map(), ua: new Map(), premium: new Map(), other: new Map(),
  };
  for (const row of (data ?? []) as { bucket: string; site: string; orders_count: number; revenue: number }[]) {
    const key = bucketKey(new Date(row.bucket), config.bucketUnit);
    const site = bySite[row.site] ? row.site : "other";
    bySite[site].set(key, { orders: Number(row.orders_count), revenue: Number(row.revenue) });
  }

  const buckets = timeline.map(({ key, label }) => {
    const ru = bySite.ru.get(key) ?? { orders: 0, revenue: 0 };
    const ua = bySite.ua.get(key) ?? { orders: 0, revenue: 0 };
    const premium = bySite.premium.get(key) ?? { orders: 0, revenue: 0 };
    const other = bySite.other.get(key) ?? { orders: 0, revenue: 0 };
    return {
      label,
      ru: ru.orders, ruRevenue: Math.round(ru.revenue),
      ua: ua.orders, uaRevenue: Math.round(ua.revenue),
      premium: premium.orders, premiumRevenue: Math.round(premium.revenue),
      orders: ru.orders + ua.orders + premium.orders + other.orders,
      revenue: Math.round(ru.revenue + ua.revenue + premium.revenue + other.revenue),
    };
  });

  return NextResponse.json({ buckets });
}
