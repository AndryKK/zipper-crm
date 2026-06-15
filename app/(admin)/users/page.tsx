import { Header } from "@/components/admin/header";
import { supabaseServer } from "@/lib/supabase";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const { data: users } = await supabaseServer
    .from("users")
    .select("id, login, person, phone, email, rank, status")
    .order("id", { ascending: false })
    .limit(200);

  const allUsers = (users || []) as any[];

  // Get order counts per login
  const { data: orderRows } = await supabaseServer
    .from("orders")
    .select("login");

  const orderCountMap: Record<string, number> = {};
  for (const row of orderRows || []) {
    if ((row as any).login) {
      orderCountMap[(row as any).login] = (orderCountMap[(row as any).login] ?? 0) + 1;
    }
  }

  return (
    <>
      <Header title={`Клієнти (${allUsers.length})`} />
      <div className="p-6">
        <div className="rounded-md border overflow-hidden bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">ID</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Логін</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Ім&apos;я</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Телефон</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Замовлень</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Ранг</th>
              </tr>
            </thead>
            <tbody>
              {allUsers.map((u: any) => (
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
