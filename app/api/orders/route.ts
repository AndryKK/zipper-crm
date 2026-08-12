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

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const filter = (searchParams.get("filter") ?? "all") as QuickFilter;
  const q = searchParams.get("q") ?? "";
  const page = parseInt(searchParams.get("page") ?? "1");

  // Only the columns the list actually renders — see app/(admin)/orders/page.tsx.
  let query = supabaseServer
    .from("orders")
    .select("id, status, person, login, addr_delivery, type, phone, date, ttn, welcome_email_sent_at", { count: "exact" })
    .order("date", { ascending: false })
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
  // See isNewStatus() in app/(admin)/orders/page.tsx for the same check
  // applied client-side to row coloring/labeling.
  if (filter === "new") query = query.or("status.is.null,status.ilike.new,status.ilike.*нов*,status.ilike.*отримано*,status.ilike.*получен*");
  else if (filter === "payment") query = query.ilike("status", "%в робот%");
  else if (filter === "shipping") query = query.ilike("status", "%оплач%");

  if (q) query = query.or(`person.ilike.*${q}*,phone.ilike.*${q}*,login.ilike.*${q}*,ttn.ilike.*${q}*`);

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
