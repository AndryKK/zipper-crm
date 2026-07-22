"use client";
import { useEffect, useState } from "react";
import { Header } from "@/components/admin/header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { apiFetch } from "@/lib/api";

// This table is named `measures` in the database (historical/legacy name),
// but it does NOT store units of measurement — it stores product
// AVAILABILITY STATUSES (В наявності / Закінчується / Очікується / Під
// замовлення / Немає в наявності). `can_be_added_to_cart` is what
// product.php actually checks to show "Нема в наявності" and disable the
// buy button on the storefront — see app/(admin)/products/product-form.tsx's
// "В наявності" selector (bound to products.package, which references this
// table's translation_id).
export default function MeasuresPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [statuses, setStatuses] = useState<any[]>([]);
  const [newTitle, setNewTitle] = useState("");
  const [newShort, setNewShort] = useState("");

  useEffect(() => {
    apiFetch<any[]>("/api/measures").then((data) => { if (data) setStatuses(data); });
  }, []);

  async function add() {
    if (!newTitle.trim()) return;
    const res = await fetch("/api/measures", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: newTitle, short_title: newShort, lang: "uk" }) });
    const created = await res.json();
    setStatuses((p) => [...p, created]);
    setNewTitle(""); setNewShort("");
    toast.success("Додано!");
  }

  async function update(id: number, field: string, value: string | number) {
    await fetch(`/api/measures/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ [field]: value }) });
    setStatuses((p) => p.map((m) => (m.id === id ? { ...m, [field]: value } : m)));
    toast.success("Збережено!");
  }

  async function remove(id: number) {
    if (!confirm("Видалити цей статус? Товари, що на нього посилаються, лишаться з непризначеним статусом.")) return;
    await fetch(`/api/measures/${id}`, { method: "DELETE" });
    setStatuses((p) => p.filter((m) => m.id !== id));
  }

  return (
    <>
      <Header title="Статус товару" />
      <div className="p-6 max-w-2xl space-y-4">
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Ці статуси показуються на сайті замість товару та визначають, чи можна його купити —
          «Можна купити» вимикає кнопку замовлення і показує «Нема в наявності» (чи інший напис нижче).
        </p>
        <div className="flex gap-2">
          <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Назва (наприклад: Очікується)" />
          <Input value={newShort} onChange={(e) => setNewShort(e.target.value)} placeholder="CSS-клас (text-success)" className="w-44" />
          <Button onClick={add}><Plus className="h-4 w-4" /></Button>
        </div>
        <div className="rounded-md border overflow-hidden bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Назва</th>
                <th className="px-4 py-2 text-left font-medium">CSS-клас</th>
                <th className="px-4 py-2 text-center font-medium">Можна купити</th>
                <th className="px-4 py-2 text-right font-medium">Дії</th>
              </tr>
            </thead>
            <tbody>
              {statuses.map((m) => (
                <tr key={m.id} className="border-t hover:bg-gray-50">
                  <td className="px-4 py-2">
                    <input defaultValue={m.title} onBlur={(e) => update(m.id, "title", e.target.value)} className="border-0 bg-transparent w-full focus:outline-none focus:ring-1 focus:ring-blue-500 rounded px-1" />
                  </td>
                  <td className="px-4 py-2">
                    <input defaultValue={m.short_title} onBlur={(e) => update(m.id, "short_title", e.target.value)} className="border-0 bg-transparent w-36 focus:outline-none focus:ring-1 focus:ring-blue-500 rounded px-1" />
                  </td>
                  <td className="px-4 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={m.can_be_added_to_cart === 1}
                      onChange={(e) => update(m.id, "can_be_added_to_cart", e.target.checked ? 1 : 0)}
                      className="h-4 w-4 cursor-pointer"
                    />
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button onClick={() => remove(m.id)} className="text-red-400 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
