import { Header } from "@/components/admin/header";
import { supabaseServer } from "@/lib/supabase";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

function orderStatusClass(status: string | null): string {
  const s = (status ?? "").toLowerCase();
  if (s.includes("завершен") || s.includes("завершено")) return "badge badge-green";
  if (s.includes("відправлен") || s.includes("отправлен")) return "badge badge-purple";
  if (s.includes("отримано") || s.includes("получен")) return "badge badge-blue";
  if (s.includes("в работ") || s.includes("в робот")) return "badge badge-amber";
  if (s.includes("скасован") || s.includes("отмен")) return "badge badge-red";
  return "badge badge-gray";
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
                <th>Клієнт</th>
                <th>Телефон</th>
                <th>Адреса</th>
                <th>Товарів</th>
                <th>Сума</th>
                <th>Дата</th>
                <th>Статус</th>
                <th style={{ textAlign: "right" }}>Дії</th>
              </tr>
            </thead>
            <tbody>
              {allOrders.map((order: any) => {
                const orderTotal = (order.items || []).reduce((s: number, i: any) => s + i.price * i.quantity, 0);
                return (
                  <tr key={order.id}>
                    <td className="font-mono text-xs" style={{ color: "var(--text-muted)" }}>{order.id}</td>
                    <td className="font-medium">{order.person ?? order.login ?? "—"}</td>
                    <td style={{ color: "var(--text-muted)" }}>{order.phone ?? "—"}</td>
                    <td className="text-xs max-w-xs truncate" style={{ color: "var(--text-muted)" }}>{order.addr_delivery ?? "—"}</td>
                    <td className="text-center">{(order.items || []).length}</td>
                    <td className="font-medium whitespace-nowrap">{orderTotal.toFixed(2)} грн</td>
                    <td style={{ color: "var(--text-muted)" }}>{formatDate(order.date)}</td>
                    <td>
                      <span className={orderStatusClass(order.status)}>
                        {order.status ?? "Новий"}
                      </span>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <Link href={`/orders/${order.id}`}>
                        <Button variant="outline" size="sm">Переглянути</Button>
                      </Link>
                    </td>
                  </tr>
                );
              })}
              {allOrders.length === 0 && (
                <tr>
                  <td colSpan={9} className="text-center" style={{ padding: "48px 16px", color: "var(--text-muted)" }}>
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
