import { Header } from "@/components/admin/header";
import { supabaseServer } from "@/lib/supabase";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import { Crown } from "lucide-react";

export const dynamic = "force-dynamic";

const SITE_BADGE_WIDTH = 30;

function sitePillStyle(bg: string): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: SITE_BADGE_WIDTH,
    height: 20,
    padding: 0,
    borderRadius: 999,
    background: bg,
    lineHeight: 1,
  };
}

// CSS-drawn flags instead of flag emoji — Windows (unlike macOS/iOS/Android)
// has no flag glyphs in its emoji font and falls back to rendering the raw
// two-letter region code, which read as ugly duplicate text next to the label.
function FlagIcon({ variant }: { variant: "ua" | "ru" }) {
  const gradient =
    variant === "ua"
      ? "linear-gradient(to bottom, #0057b7 50%, #ffd700 50%)"
      : "linear-gradient(to bottom, #fff 33.33%, #0039a6 33.33%, #0039a6 66.66%, #d52b1e 66.66%)";
  return (
    <span
      style={{
        display: "inline-block",
        width: 18,
        height: 13,
        borderRadius: 2,
        background: gradient,
        border: "1px solid rgba(0,0,0,0.15)",
        flexShrink: 0,
      }}
    />
  );
}

// The order's own type ('ru'/'uk', set by whichever storefront actually
// created it) always wins over the customer's account — a customer who also
// has a Zipper Premium account (password === 'SUPABASE_AUTH') still gets
// tagged RU/UA for an order that actually came from that site. "Premium"
// only shows when the order itself carries neither a ru nor uk type (i.e.
// it really did come from Zipper Premium, not just from a premium customer
// shopping on the regular sites).
function SiteBadge({ type, isPremiumUser }: { type: string | null; isPremiumUser: boolean }) {
  if (type === "ru") {
    return (
      <span title="Замовлення з zipper.in.ua (RU)" style={sitePillStyle("rgba(190,18,60,0.08)")}>
        <FlagIcon variant="ru" />
      </span>
    );
  }
  if (type === "uk") {
    return (
      <span title="Замовлення з zipper.com.ua (UA)" style={sitePillStyle("rgba(0,87,183,0.08)")}>
        <FlagIcon variant="ua" />
      </span>
    );
  }
  if (isPremiumUser) {
    return (
      <span
        title="Замовлення з Zipper Premium"
        style={{
          ...sitePillStyle("linear-gradient(135deg,#f59e0b,#d97706)"),
          boxShadow: "0 1px 2px rgba(217,119,6,0.35)",
        }}
      >
        <Crown size={13} color="#fff" strokeWidth={2.5} />
      </span>
    );
  }
  return (
    <span style={{ ...sitePillStyle("transparent"), color: "var(--text-muted)" }}>—</span>
  );
}

function orderStatusLabel(status: string | null): string {
  const s = (status ?? "").toLowerCase();
  if (s.includes("отримано") || s.includes("получен")) return "Отримано";
  return status ?? "Новий";
}

function orderStatusClass(status: string | null): string {
  const s = (status ?? "").toLowerCase();
  if (s.includes("завершен") || s.includes("завершено")) return "badge badge-green";
  if (s.includes("відправлен") || s.includes("отправлен")) return "badge badge-purple";
  if (s.includes("отримано") || s.includes("получен")) return "badge badge-blue";
  if (s.includes("в работ") || s.includes("в робот")) return "badge badge-amber";
  if (s.includes("скасован") || s.includes("отмен")) return "badge badge-red";
  return "badge badge-gray";
}

function orderRowClass(status: string | null): string {
  const s = (status ?? "").toLowerCase();
  if (s.includes("в работ") || s.includes("в робот")) return "order-row--progress";
  if (s.includes("отримано") || s.includes("получен")) return "order-row--received";
  if (!s || s.includes("нов")) return "order-row--new";
  return "";
}

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const statusFilter = sp.status ?? "";
  const page = parseInt(sp.page ?? "1");
  const q = sp.q ?? "";
  const limit = 30;

  let query = supabaseServer
    .from("orders")
    .select("*", { count: "exact" })
    .order("date", { ascending: false })
    .range((page - 1) * limit, page * limit - 1);

  if (statusFilter) query = query.eq("status", statusFilter);
  if (q) query = query.or(`person.ilike.%${q}%,phone.ilike.%${q}%,login.ilike.%${q}%`);

  const { data: orderRows, count } = await query;
  const total = count ?? 0;
  const totalPages = Math.ceil(total / limit);

  const orderIds = (orderRows || []).map((o: any) => o.id);
  const { data: allItems } = orderIds.length > 0
    ? await supabaseServer.from("orders_item").select("*").in("oid", orderIds)
    : { data: [] };

  const logins = Array.from(new Set((orderRows || []).map((o: any) => o.login).filter(Boolean)));
  const { data: loginUsers } = logins.length > 0
    ? await supabaseServer.from("users").select("login, password").in("login", logins)
    : { data: [] };
  const premiumLogins = new Set(
    (loginUsers || []).filter((u: any) => u.password === "SUPABASE_AUTH").map((u: any) => u.login)
  );

  const allOrders = (orderRows || []).map((o: any) => ({
    ...o,
    items: (allItems || []).filter((i: any) => i.oid === o.id),
  }));

  return (
    <>
      <Header title="Замовлення" />
      <div className="p-6 space-y-4">
        <div className="crm-card overflow-hidden">
          <table className="crm-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Дії</th>
                <th>Статус</th>
                <th>Клієнт</th>
                <th>Адреса</th>
                <th style={{ textAlign: "center" }}>Сайт</th>
                <th>Товарів</th>
                <th>Сума</th>
                <th>Дата</th>
                <th>Телефон</th>
              </tr>
            </thead>
            <tbody>
              {allOrders.map((order: any) => {
                const orderTotal = (order.items || []).reduce((s: number, i: any) => s + i.price * i.quantity, 0);
                return (
                  <tr key={order.id} className={orderRowClass(order.status)}>
                    <td className="font-mono text-xs" style={{ color: "var(--text-muted)" }}>{order.id}</td>
                    <td>
                      <Link href={`/orders/${order.id}`}>
                        <Button variant="outline" size="sm">Переглянути</Button>
                      </Link>
                    </td>
                    <td>
                      <span className={orderStatusClass(order.status)}>
                        {orderStatusLabel(order.status)}
                      </span>
                    </td>
                    <td className="font-medium">{order.person ?? order.login ?? "—"}</td>
                    <td className="text-xs max-w-xs truncate" style={{ color: "var(--text-muted)" }}>{order.addr_delivery ?? "—"}</td>
                    <td style={{ textAlign: "center" }}>
                      <SiteBadge type={order.type} isPremiumUser={premiumLogins.has(order.login)} />
                    </td>
                    <td className="text-center">{(order.items || []).length}</td>
                    <td className="font-medium whitespace-nowrap">{orderTotal.toFixed(2)} грн</td>
                    <td style={{ color: "var(--text-muted)" }}>{formatDate(order.date)}</td>
                    <td style={{ color: "var(--text-muted)" }}>{order.phone ?? "—"}</td>
                  </tr>
                );
              })}
              {allOrders.length === 0 && (
                <tr>
                  <td colSpan={10} className="text-center" style={{ padding: "48px 16px", color: "var(--text-muted)" }}>
                    Замовлень немає
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between text-sm" style={{ color: "var(--text-muted)" }}>
          <span>Всього: {total}</span>
          {totalPages > 1 && (
            <div className="flex items-center gap-2">
              {page > 1 && <Link href={`/orders?page=${page - 1}${statusFilter ? `&status=${statusFilter}` : ""}`}><Button variant="outline" size="sm">← Попередня</Button></Link>}
              <span>Сторінка {page} з {totalPages}</span>
              {page < totalPages && <Link href={`/orders?page=${page + 1}${statusFilter ? `&status=${statusFilter}` : ""}`}><Button variant="outline" size="sm">Наступна →</Button></Link>}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
