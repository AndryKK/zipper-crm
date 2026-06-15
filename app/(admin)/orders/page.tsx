import { Header } from "@/components/admin/header";
import { prisma } from "@/lib/db";
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

  const where = {
    ...(statusFilter && { status: statusFilter }),
    ...(q && {
      OR: [
        { person: { contains: q } },
        { phone: { contains: q } },
        { login: { contains: q } },
      ],
    }),
  };

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: { date: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: { items: true },
    }),
    prisma.order.count({ where }),
  ]);

  const totalPages = Math.ceil(total / limit);

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
              {orders.map((order) => {
                const total = order.items.reduce((s, i) => s + i.price * i.quantity, 0);
                return (
                  <tr key={order.id} className="border-t hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-2.5 font-mono text-gray-400 text-xs">{order.id}</td>
                    <td className="px-4 py-2.5 font-medium">{order.person ?? order.login ?? "—"}</td>
                    <td className="px-4 py-2.5 text-gray-600">{order.phone ?? "—"}</td>
                    <td className="px-4 py-2.5 text-gray-500 text-xs max-w-xs truncate">{order.addrDelivery ?? "—"}</td>
                    <td className="px-4 py-2.5 text-center">{order.items.length}</td>
                    <td className="px-4 py-2.5 font-medium whitespace-nowrap">{total.toFixed(2)} грн</td>
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
              {orders.length === 0 && (
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
