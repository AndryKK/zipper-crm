import { Header } from "@/components/admin/header";
import { prisma } from "@/lib/db";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const [users, orderCounts] = await Promise.all([
    prisma.user.findMany({
      orderBy: { id: "desc" },
      take: 200,
      omit: { password: true },
      include: { _count: { select: { carts: true } } },
    }),
    prisma.order.groupBy({ by: ["login"], _count: { id: true } }),
  ]);
  const orderCountMap = Object.fromEntries(orderCounts.map((o) => [o.login, o._count.id]));

  return (
    <>
      <Header title={`Клієнти (${users.length})`} />
      <div className="p-6">
        <div className="rounded-md border overflow-hidden bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">ID</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Логін</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Ім'я</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Телефон</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Замовлень</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Ранг</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t hover:bg-gray-50">
                  <td className="px-4 py-2.5 text-gray-400 font-mono text-xs">{u.id}</td>
                  <td className="px-4 py-2.5 font-medium">{u.login}</td>
                  <td className="px-4 py-2.5">{u.person ?? "—"}</td>
                  <td className="px-4 py-2.5 text-gray-600">{u.phone ?? "—"}</td>
                  <td className="px-4 py-2.5 text-center">{orderCountMap[u.login] ?? 0}</td>
                  <td className="px-4 py-2.5">{u.rank ? <Badge variant="secondary">Ранг {u.rank}</Badge> : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
