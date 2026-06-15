import { Header } from "@/components/admin/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabaseServer } from "@/lib/supabase";
import { ShoppingCart, Package, Users, FileText } from "lucide-react";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

async function getStats() {
  const [
    { count: productsCount },
    { count: ordersCount },
    { count: usersCount },
    { count: articlesCount },
    { data: orderRows },
  ] = await Promise.all([
    supabaseServer.from("products").select("*", { count: "exact", head: true }).eq("lang", "uk"),
    supabaseServer.from("orders").select("*", { count: "exact", head: true }),
    supabaseServer.from("users").select("*", { count: "exact", head: true }),
    supabaseServer.from("articles").select("*", { count: "exact", head: true }).eq("lang", "uk"),
    supabaseServer.from("orders").select("*").order("date", { ascending: false }).limit(10),
  ]);

  const orderIds = (orderRows || []).map((o: any) => o.id);
  const { data: orderItems } = orderIds.length > 0
    ? await supabaseServer.from("orders_item").select("*").in("oid", orderIds)
    : { data: [] };

  const orders = (orderRows || []).map((o: any) => ({
    ...o,
    items: (orderItems || []).filter((i: any) => i.oid === o.id),
  }));
  const newOrders = orders.filter((o: any) => !o.status || o.status === "Получен").length;
  return {
    productsCount: productsCount ?? 0,
    ordersCount: ordersCount ?? 0,
    usersCount: usersCount ?? 0,
    articlesCount: articlesCount ?? 0,
    recentOrders: orders,
    newOrders,
  };
}

export default async function DashboardPage() {
  const { productsCount, ordersCount, usersCount, articlesCount, recentOrders, newOrders } = await getStats();

  return (
    <>
      <Header title="Дашборд" />
      <div className="p-6 space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={Package} label="Товарів (uk)" value={productsCount} color="blue" />
          <StatCard icon={ShoppingCart} label="Замовлень" value={ordersCount} badge={newOrders > 0 ? `${newOrders} нових` : undefined} color="green" />
          <StatCard icon={Users} label="Клієнтів" value={usersCount} color="purple" />
          <StatCard icon={FileText} label="Статей" value={articlesCount} color="orange" />
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Останні замовлення</CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-gray-500">
                  <th className="pb-2 text-left font-medium">#</th>
                  <th className="pb-2 text-left font-medium">Клієнт</th>
                  <th className="pb-2 text-left font-medium">Телефон</th>
                  <th className="pb-2 text-left font-medium">Сума</th>
                  <th className="pb-2 text-left font-medium">Дата</th>
                  <th className="pb-2 text-left font-medium">Статус</th>
                </tr>
              </thead>
              <tbody>
                {recentOrders.map((order: any) => {
                  const total = (order.items || []).reduce((s: number, i: any) => s + i.price * i.quantity, 0);
                  return (
                    <tr key={order.id} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="py-2.5 font-mono">{order.id}</td>
                      <td className="py-2.5">{order.person ?? order.login ?? "—"}</td>
                      <td className="py-2.5">{order.phone ?? "—"}</td>
                      <td className="py-2.5 font-medium">{total.toFixed(2)} грн</td>
                      <td className="py-2.5 text-gray-500">{formatDate(order.date)}</td>
                      <td className="py-2.5">
                        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-700">
                          {order.status ?? "Новий"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {recentOrders.length === 0 && (
                  <tr><td colSpan={6} className="py-8 text-center text-gray-400">Замовлень немає</td></tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function StatCard({ icon: Icon, label, value, badge, color }: {
  icon: React.FC<{ className?: string }>;
  label: string;
  value: number;
  badge?: string;
  color: "blue" | "green" | "purple" | "orange";
}) {
  const colors = {
    blue: "bg-blue-50 text-blue-600",
    green: "bg-green-50 text-green-600",
    purple: "bg-purple-50 text-purple-600",
    orange: "bg-orange-50 text-orange-600",
  };
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500">{label}</p>
            <p className="text-3xl font-bold mt-1">{value.toLocaleString()}</p>
            {badge && <p className="text-xs text-orange-600 mt-1">{badge}</p>}
          </div>
          <div className={`flex h-12 w-12 items-center justify-center rounded-full ${colors[color]}`}>
            <Icon className="h-6 w-6" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
