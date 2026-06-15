import { Header } from "@/components/admin/header";
import { supabaseServer } from "@/lib/supabase";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

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
        <div className="rounded-md border overflow-hidden bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">#</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Клієнт</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Телефон</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Адреса</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Товарів</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Сума</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Дата</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Статус</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">Дії</th>
              </tr>
            </thead>
            <tbody>
              {allOrders.map((order: any) => {
                const orderTotal = (order.items || []).reduce((s: number, i: any) => s + i.price * i.quantity, 0);
                return (
                  <tr key={order.id} className="border-t hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-2.5 font-mono text-gray-400 text-xs">{order.id}</td>
                    <td className="px-4 py-2.5 font-medium">{order.person ?? order.login ?? "—"}</td>
                    <td className="px-4 py-2.5 text-gray-600">{order.phone ?? "—"}</td>
                    <td className="px-4 py-2.5 text-gray-500 text-xs max-w-xs truncate">{order.addr_delivery ?? "—"}</td>
                    <td className="px-4 py-2.5 text-center">{(order.items || []).length}</td>
                    <td className="px-4 py-2.5 font-medium whitespace-nowrap">{orderTotal.toFixed(2)} грн</td>
                    <td className="px-4 py-2.5 text-gray-500">{formatDate(order.date)}</td>
                    <td className="px-4 py-2.5">
                      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-700">
                        {order.status ?? "Новий"}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <Link href={`/orders/${order.id}`}>
                        <Button variant="outline" size="sm">Переглянути</Button>
                      </Link>
                    </td>
                  </tr>
                );
              })}
              {allOrders.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-gray-400">Замовлень немає</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between text-sm text-gray-500">
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
