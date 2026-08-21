import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { auth } from "@/lib/auth";

// Keep in sync with app/(admin)/orders/page.tsx's PAGE_SIZE.
const PAGE_SIZE = 15;

// Quick status-bucket filters for the orders list's header buttons, derived
// from the canonical order pipeline (see PIPELINE in
// app/(admin)/orders/[id]/page.tsx): Новий → В роботі → Оплачено →
// Відправлено → Завершено (+ Скасовано as a separate terminal state).
// Matching is fuzzy/case-insensitive on purpose — legacy imported orders mix
// Ukrainian and Russian status text for the same real states.
type QuickFilter = "all" | "new" | "payment" | "shipping";

// Exact-status deep link from the dashboard's "Статуси замовлень" pie
// chart (app/(admin)/page.tsx) — that chart counts orders via
// lib/order-status.ts's isNewStatus() for the "Новий" bucket (Отримано/
// Получен included, same as everywhere else in the app), so clicking a
// slice showing "9" must land here on exactly those 9 orders. Kept as its
// own table (not the "payment"/"shipping" quick filters above) since this
// needs all six exact pipeline names, not just those two fuzzy buckets.
const STATUS_FILTER_CLAUSES: Record<string, string> = {
  "Новий": "status.is.null,status.ilike.new,status.ilike.*нов*,status.ilike.*отримано*,status.ilike.*получен*",
  "В роботі": "status.ilike.*в работ*,status.ilike.*в робот*",
  "Оплачено": "status.ilike.*оплач*",
  "Відправлено": "status.ilike.*відправлен*,status.ilike.*отправлен*",
  "Завершено": "status.ilike.*завершен*",
  "Скасовано": "status.ilike.*скасован*,status.ilike.*отмен*",
};

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const filter = (searchParams.get("filter") ?? "all") as QuickFilter;
  const status = searchParams.get("status") ?? "";
  // Only meaningful together with status= — the dashboard pie chart counts
  // a fixed trailing window (currently 7 days), so a click-through link
  // that only carried status= would land on every order of that status
  // ever (tens of thousands), not the handful the chart actually counted.
  const days = parseInt(searchParams.get("days") ?? "");
  const q = searchParams.get("q") ?? "";
  const page = parseInt(searchParams.get("page") ?? "1");

  // Only the columns the list actually renders — see app/(admin)/orders/page.tsx.
  // Sorted by id, not date: `date` is a naive `timestamp without time zone`,
  // and orders synced in from the legacy MySQL DB (scripts/sync-legacy-mysql.js)
  // keep MySQL's original local-time value there while natively-created
  // orders get UTC — mixing the two in one column makes "ORDER BY date"
  // occasionally rank an older legacy order above a genuinely newer one. `id`
  // is a strictly increasing sequence immune to that mismatch and always
  // reflects real creation order, for both sources.
  let query = supabaseServer
    .from("orders")
    .select("id, status, person, login, addr_delivery, type, phone, date, ttn, welcome_email_sent_at", { count: "exact" })
    .order("id", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  // Inside .or()'s embedded filter-list syntax, PostgREST requires "*" in
  // place of "%" for like/ilike patterns (the raw string isn't run through
  // the same per-value URL-encoding as a real .ilike() call, so a literal
  // "%" there is taken literally instead of as a wildcard) — using "%" here
  // silently matched nothing beyond the plain status.is.null half, which is
  // why the "new" quick filter wasn't actually filtering anything out.
  //
  // Brand-new/unprocessed orders carry the literal English status "new"
  // (lowercase — a legacy leftover; confirmed directly against the live
  // table, e.g. order #1) rather than null, empty, or a Ukrainian/Russian
  // word — the null/"нов*" checks alone matched exactly zero real rows,
  // which is why this filter always came back empty even with the *-fix
  // above.
  //
  // The storefront's actual checkout flow writes "Получен"/"Отримано" for
  // a freshly-placed order — a literal-translation trap ("received the
  // order", not "customer received the parcel"): verified directly
  // against the live table, all 89 orders with this status have both
  // ttn=null and pay_method=null, i.e. none were ever paid or shipped.
  // See isNewStatus() in lib/order-status.ts for the same check applied
  // client-side to row coloring/labeling.
  //
  // A status= deep link (from the dashboard pie chart) takes priority
  // over the filter= quick-filter buckets — the two are never both
  // present in practice (the pie-chart link only ever sends status=), but
  // status= being the more specific ask is the more sensible tiebreak if
  // a URL somehow carried both.
  const statusClause = STATUS_FILTER_CLAUSES[status];
  if (statusClause) {
    query = query.or(statusClause);
    if (Number.isFinite(days) && days > 0) {
      const since = new Date();
      since.setDate(since.getDate() - days);
      query = query.gte("date", since.toISOString());
    }
  }
  else if (filter === "new") query = query.or("status.is.null,status.ilike.new,status.ilike.*нов*,status.ilike.*отримано*,status.ilike.*получен*");
  else if (filter === "payment") query = query.ilike("status", "%в робот%");
  else if (filter === "shipping") query = query.ilike("status", "%оплач%");

  if (q) {
    // A pure-digit query also matches the order number exactly (id is an
    // int column — PostgREST's ilike can't fuzzy-match it as text), on top
    // of the existing fuzzy matches so a numeric query still finds it in a
    // phone/ttn field too.
    const idClause = /^\d+$/.test(q.trim()) ? `id.eq.${q.trim()},` : "";
    query = query.or(`${idClause}person.ilike.*${q}*,phone.ilike.*${q}*,login.ilike.*${q}*,ttn.ilike.*${q}*`);
  }

  const { data: orderRows, count } = await query;

  const orderIds = (orderRows || []).map((o: { id: number }) => o.id);
  const { data: allItems } = orderIds.length > 0
    ? await supabaseServer.from("orders_item").select("oid, price, quantity").in("oid", orderIds)
    : { data: [] };

  const logins = Array.from(new Set((orderRows || []).map((o: { login: string | null }) => o.login).filter(Boolean)));
  const { data: loginUsers } = logins.length > 0
    ? await supabaseServer.from("users").select("login, password").in("login", logins)
    : { data: [] };
  const premiumLogins = (loginUsers || [])
    .filter((u: { password: string }) => u.password === "SUPABASE_AUTH")
    .map((u: { login: string }) => u.login);

  const items = (orderRows || []).map((o: { id: number; login: string | null }) => ({
    ...o,
    items: (allItems || []).filter((i: { oid: number }) => i.oid === o.id),
    isPremiumUser: premiumLogins.includes(o.login ?? ""),
  }));

  return NextResponse.json({ items, total: count ?? 0 });
}
