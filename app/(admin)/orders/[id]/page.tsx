"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { Header } from "@/components/admin/header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { formatDate } from "@/lib/utils";
import { ArrowLeft, Loader2 } from "lucide-react";

const STATUSES = ["Отримано", "В роботі", "Відправлено", "Завершено", "Скасовано"];

export default function OrderDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [order, setOrder] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    apiFetch<any>(`/api/orders/${params.id}`).then((data) => {
      if (!data) return;
      setOrder(data);
      setStatus(data.status ?? "");
      setNotes(data.notes ?? "");
    });
  }, [params.id]);

  async function save() {
    setSaving(true);
    await fetch(`/api/orders/${params.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, notes }),
    });
    toast.success("Збережено!");
    setSaving(false);
  }

  if (!order) return <div className="p-6 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></div>;

  const orderTotal = order.items?.reduce((s: number, i: { price: number; quantity: number }) => s + i.price * i.quantity, 0) ?? 0;

  return (
    <>
      <Header title={`Замовлення #${order.id}`} />
      <div className="p-6 space-y-6 max-w-4xl">
        <button onClick={() => router.push("/orders")} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900">
          <ArrowLeft className="h-4 w-4" />Назад до замовлень
        </button>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader><CardTitle className="text-sm">Клієнт</CardTitle></CardHeader>
            <CardContent className="space-y-1 text-sm">
              <div><span className="text-gray-500">Ім&apos;я:</span> {order.person ?? "—"}</div>
              <div><span className="text-gray-500">Телефон:</span> {order.phone ?? "—"}</div>
              <div><span className="text-gray-500">Логін:</span> {order.login ?? "—"}</div>
              <div><span className="text-gray-500">Адреса:</span> {order.addrDelivery ?? "—"}</div>
              {order.ttn && <div><span className="text-gray-500">ТТН:</span> {order.ttn}</div>}
              {order.pay_method && <div><span className="text-gray-500">Оплата:</span> {order.pay_method}</div>}
              <div><span className="text-gray-500">Дата:</span> {formatDate(order.date)}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-sm">Управління</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label>Статус</Label>
                <Input
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  list="status-options"
                  placeholder="Введіть або оберіть статус"
                />
                <datalist id="status-options">
                  {STATUSES.map((s) => <option key={s} value={s} />)}
                </datalist>
              </div>
              <div className="space-y-1.5">
                <Label>Нотатки</Label>
                <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
              <Button onClick={save} disabled={saving} className="w-full">
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Зберегти
              </Button>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader><CardTitle className="text-sm">Товари замовлення</CardTitle></CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-gray-500">
                  <th className="pb-2 text-left font-medium">ID товару</th>
                  <th className="pb-2 text-left font-medium">Тип</th>
                  <th className="pb-2 text-right font-medium">Ціна</th>
                  <th className="pb-2 text-right font-medium">К-сть</th>
                  <th className="pb-2 text-right font-medium">Сума</th>
                </tr>
              </thead>
              <tbody>
                {order.items?.map((item: { id: number; product: number; type: string | null; price: number; quantity: number }) => (
                  <tr key={item.id} className="border-b last:border-0">
                    <td className="py-2 font-mono text-xs text-gray-500">#{item.product}</td>
                    <td className="py-2 text-gray-500">{item.type ?? "—"}</td>
                    <td className="py-2 text-right">{item.price.toFixed(2)} грн</td>
                    <td className="py-2 text-right">{item.quantity}</td>
                    <td className="py-2 text-right font-medium">{(item.price * item.quantity).toFixed(2)} грн</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4} className="pt-3 text-right font-semibold">Разом:</td>
                  <td className="pt-3 text-right font-bold text-lg">{orderTotal.toFixed(2)} грн</td>
                </tr>
              </tfoot>
            </table>
          </CardContent>
        </Card>

        {order.returns?.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-sm text-red-600">Повернення</CardTitle></CardHeader>
            <CardContent>
              {order.returns.map((ret: { id: number; reason: string | null; date: string; status: string | null }) => (
                <div key={ret.id} className="border-b last:border-0 py-2 text-sm">
                  <span className="text-gray-500">#{ret.id}</span> — {ret.reason ?? "Без причини"} ({formatDate(ret.date)})
                  {ret.status && <span className="ml-2 text-gray-400">[{ret.status}]</span>}
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
