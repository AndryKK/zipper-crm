"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/admin/header";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import { Crown, Truck, Banknote, ClipboardList, LayoutGrid, Search, Mail } from "lucide-react";
import { Pagination } from "@/components/admin/data-table-controls";
import { isNewStatus, orderStatusLabel, orderStatusClass, orderRowClass } from "@/lib/order-status";

const PAGE_SIZE = 15;

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

// isNewStatus/orderStatusLabel/orderStatusClass/orderRowClass now live in
// lib/order-status.ts, shared with the dashboard's "Останні замовлення" —
// see that file's own comment for why.

// Quick status-bucket filters, mirrored server-side in
// app/api/orders/route.ts against the canonical pipeline (see PIPELINE in
// app/(admin)/orders/[id]/page.tsx): Новий → В роботі → Оплачено →
// Відправлено → Завершено. Each button's color matches the row background
// of the orders it reveals (see .order-row--* in globals.css) — "Усі"
// isn't tied to a status, so it keeps the site's neutral accent color.
const QUICK_FILTERS = [
  { id: "all", label: "Усі", hint: "Усі замовлення", icon: LayoutGrid, color: "#6366f1" },
  { id: "new", label: "Нові", hint: "Нові — потребують опрацювання", icon: ClipboardList, color: "#10b981" },
  { id: "payment", label: "Очікують оплату", hint: "В роботі — очікують оплату", icon: Banknote, color: "#f59e0b" },
  { id: "shipping", label: "Очікують відправку", hint: "Оплачено — очікують відправку", icon: Truck, color: "#2563eb" },
] as const;

type QuickFilterId = (typeof QUICK_FILTERS)[number]["id"];

interface OrderRow {
  id: number;
  status: string | null;
  person: string | null;
  login: string | null;
  addr_delivery: string | null;
  type: string | null;
  phone: string | null;
  date: string;
  ttn: string | null;
  welcome_email_sent_at: string | null;
  items: { price: number; quantity: number }[];
  isPremiumUser: boolean;
}

export default function OrdersPage() {
  const router = useRouter();
  const [filter, setFilter] = useState<QuickFilterId>("all");
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ filter, page: String(page), limit: String(PAGE_SIZE) });
    if (q) params.set("q", q);
    const res = await fetch(`/api/orders?${params}`);
    const data = await res.json();
    setOrders(data.items ?? []);
    setTotal(data.total ?? 0);
    setLoading(false);
  }, [filter, page, q]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [filter, q]);

  // Debounce search input before it hits the server.
  useEffect(() => {
    const t = setTimeout(() => setQ(qInput), 300);
    return () => clearTimeout(t);
  }, [qInput]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <Header title="Замовлення" />
      <div className="p-4 md:p-6 space-y-4">
        {/* Horizontally scrollable on phone instead of wrapping to N lines
            of chips — a swipeable single row reads better at 375px than a
            wrapped block eating vertical space before any actual orders
            are visible. */}
        <div
          className="hide-scrollbar"
          style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 2, WebkitOverflowScrolling: "touch" }}
        >
          {QUICK_FILTERS.map((f) => {
            const Icon = f.icon;
            const active = filter === f.id;
            return (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                title={f.hint}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "7px 13px",
                  borderRadius: 999,
                  border: `1px solid ${active ? f.color : `${f.color}55`}`,
                  background: active ? f.color : `${f.color}18`,
                  color: active ? "#fff" : f.color,
                  fontSize: 12.5,
                  fontWeight: 600,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                }}
              >
                <Icon size={13} />
                {f.label}
              </button>
            );
          })}
        </div>

        <div style={{ position: "relative" }} className="max-w-full md:max-w-[360px]">
          <Search size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
          <input
            className="crm-input"
            placeholder="Пошук за номером, клієнтом, телефоном, логіном, ТТН..."
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            style={{ paddingLeft: 36 }}
          />
        </div>

        {/* ── Mobile card list (< md) ──────────────────────────────────── */}
        <div className="md:hidden space-y-3">
          {loading ? (
            <div className="crm-card" style={{ padding: "40px 16px", textAlign: "center", color: "var(--text-muted)" }}>
              Завантаження...
            </div>
          ) : orders.length === 0 ? (
            <div className="crm-card" style={{ padding: "40px 16px", textAlign: "center", color: "var(--text-muted)" }}>
              Замовлень немає
            </div>
          ) : (
            orders.map((order) => {
              const orderTotal = (order.items || []).reduce((s, i) => s + i.price * i.quantity, 0);
              return (
                // A plain div (not <Link>/<a>) — the phone number inside
                // needs its own real <a href="tel:...">, and nested <a>
                // tags are invalid HTML (React hydration error in dev,
                // undefined browser behavior in prod: the outer link's
                // click handler wins over the inner one).
                <div
                  key={order.id}
                  onClick={() => router.push(`/orders/${order.id}`)}
                  className={`crm-card block ${orderRowClass(order.status)}`}
                  style={{ padding: 14, cursor: "pointer" }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                      <SiteBadge type={order.type} isPremiumUser={order.isPremiumUser} />
                      <span className="font-mono" style={{ fontSize: 13, color: "var(--text-muted)", flexShrink: 0 }}>
                        #{order.id}
                      </span>
                      {order.welcome_email_sent_at && (
                        <span title="Вітальне повідомлення надіслано">
                          <Mail size={12} color="#059669" />
                        </span>
                      )}
                    </div>
                    <span className={orderStatusClass(order.status)} style={{ flexShrink: 0 }}>
                      {orderStatusLabel(order.status)}
                    </span>
                  </div>

                  <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", marginBottom: 2 }}>
                    {order.person ?? order.login ?? "—"}
                  </div>
                  {order.phone && (
                    <a
                      href={`tel:${order.phone}`}
                      onClick={(e) => e.stopPropagation()}
                      style={{ fontSize: 13, color: "var(--accent)", textDecoration: "none", fontFamily: "monospace" }}
                    >
                      {order.phone}
                    </a>
                  )}
                  {order.addr_delivery && (
                    <div
                      style={{
                        fontSize: 12.5, color: "var(--text-muted)", marginTop: 4,
                        overflow: "hidden", textOverflow: "ellipsis",
                        display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                      }}
                    >
                      {order.addr_delivery}
                    </div>
                  )}
                  {order.ttn && (
                    <div className="font-mono" style={{ fontSize: 11, color: "var(--text-muted)", opacity: 0.8, marginTop: 2 }}>
                      ТТН: {order.ttn}
                    </div>
                  )}

                  <div
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--border)",
                    }}
                  >
                    <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                      {(order.items || []).length} тов. · {formatDate(order.date)}
                    </span>
                    <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>
                      {orderTotal.toFixed(2)} грн
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* ── Desktop table (>= md) ─────────────────────────────────────── */}
        <div className="crm-card overflow-hidden hidden md:block">
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
              {loading ? (
                <tr>
                  <td colSpan={10} className="text-center" style={{ padding: "48px 16px", color: "var(--text-muted)" }}>
                    Завантаження...
                  </td>
                </tr>
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center" style={{ padding: "48px 16px", color: "var(--text-muted)" }}>
                    Замовлень немає
                  </td>
                </tr>
              ) : (
                orders.map((order) => {
                  const orderTotal = (order.items || []).reduce((s, i) => s + i.price * i.quantity, 0);
                  return (
                    <tr key={order.id} className={orderRowClass(order.status)}>
                      <td className="font-mono text-xs" style={{ color: "var(--text-muted)" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                          {order.id}
                          {order.welcome_email_sent_at && (
                            <span title="Вітальне повідомлення надіслано">
                              <Mail size={12} color="#059669" />
                            </span>
                          )}
                        </div>
                      </td>
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
                      <td className="text-xs max-w-xs truncate" style={{ color: "var(--text-muted)" }}>
                        {order.addr_delivery ?? "—"}
                        {order.ttn && (
                          <div className="font-mono" style={{ fontSize: 11, opacity: 0.8, marginTop: 2 }}>
                            ТТН: {order.ttn}
                          </div>
                        )}
                      </td>
                      <td style={{ textAlign: "center" }}>
                        <SiteBadge type={order.type} isPremiumUser={order.isPremiumUser} />
                      </td>
                      <td className="text-center">{(order.items || []).length}</td>
                      <td className="font-medium whitespace-nowrap">{orderTotal.toFixed(2)} грн</td>
                      <td style={{ color: "var(--text-muted)" }}>{formatDate(order.date)}</td>
                      <td style={{ color: "var(--text-muted)" }}>{order.phone ?? "—"}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between text-sm" style={{ color: "var(--text-muted)" }}>
          <span>Всього: {total}</span>
        </div>
        <Pagination page={page} totalPages={totalPages} onChange={setPage} />
      </div>
    </>
  );
}
