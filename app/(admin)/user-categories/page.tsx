"use client";
import { useEffect, useState } from "react";
import { Header } from "@/components/admin/header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { apiFetch } from "@/lib/api";

export default function UserCategoriesPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [cats, setCats] = useState<any[]>([]);
  const [form, setForm] = useState({ title: "", discount: 0, discount_total: 0 });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiFetch<any[]>("/api/user-categories").then((data) => { if (data) setCats(data); });
  }, []);

  async function add() {
    if (!form.title.trim()) return;
    setSaving(true);
    const res = await fetch("/api/user-categories", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const created = await res.json();
    setCats((p) => [...p, created]);
    setForm({ title: "", discount: 0, discount_total: 0 });
    toast.success("Категорію додано!");
    setSaving(false);
  }

  // Was firing "Збережено!" unconditionally, without ever checking whether
  // the PUT actually succeeded — a save that silently failed (expired
  // session, network hiccup) still told the admin it worked, and the input
  // (uncontrolled, defaultValue-based) kept showing the typed value even
  // though the DB never got it — reading as "editing doesn't work" once the
  // page was reloaded and the old value reappeared.
  async function update(id: number, field: string, value: string | number) {
    try {
      const res = await fetch(`/api/user-categories/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ [field]: value }) });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? "Не вдалося зберегти");
        return;
      }
      const updated = await res.json();
      setCats((p) => p.map((c) => (c.id === id ? { ...c, ...updated } : c)));
      toast.success("Збережено!");
    } catch {
      toast.error("Помилка з'єднання");
    }
  }

  async function remove(id: number) {
    if (!confirm("Видалити категорію?")) return;
    await fetch(`/api/user-categories/${id}`, { method: "DELETE" });
    setCats((p) => p.filter((c) => c.id !== id));
  }

  return (
    <>
      <Header title="Категорії клієнтів" />
      <div className="p-6 space-y-6 max-w-2xl">
        <div className="rounded-md border bg-white p-4 space-y-3">
          <h3 className="font-medium text-sm">Додати категорію</h3>
          <div className="flex gap-3">
            <div className="space-y-1 flex-1">
              <Label>Назва *</Label>
              <Input value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} />
            </div>
            <div className="space-y-1 w-28">
              <Label>Знижка %</Label>
              <Input type="number" value={form.discount} onChange={(e) => setForm((p) => ({ ...p, discount: parseFloat(e.target.value) }))} />
            </div>
            <div className="space-y-1 w-40">
              <Label>Мін. сума, грн</Label>
              <Input type="number" value={form.discount_total} onChange={(e) => setForm((p) => ({ ...p, discount_total: parseFloat(e.target.value) }))} />
            </div>
          </div>
          <Button onClick={add} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
            Додати
          </Button>
        </div>
        <div className="rounded-md border overflow-hidden bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Назва</th>
                <th className="px-4 py-2 text-left font-medium w-28">Знижка %</th>
                <th className="px-4 py-2 text-left font-medium w-40">Мін. сума, грн</th>
                <th className="px-4 py-2 text-right font-medium w-16">Дії</th>
              </tr>
            </thead>
            <tbody>
              {cats.map((c) => (
                <tr key={c.id} className="border-t hover:bg-gray-50">
                  <td className="px-4 py-2">
                    {/* key includes the last known-saved value so a successful
                        save (setCats above) remounts the uncontrolled input
                        with the server-confirmed value instead of silently
                        keeping whatever was last typed. */}
                    <input
                      key={`title-${c.id}-${c.title}`}
                      defaultValue={c.title}
                      onBlur={(e) => update(c.id, "title", e.target.value)}
                      className="border border-gray-200 bg-white w-full focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 rounded px-2 py-1"
                    />
                  </td>
                  <td className="px-4 py-2">
                    <input
                      key={`discount-${c.id}-${c.discount}`}
                      type="number"
                      defaultValue={c.discount}
                      onBlur={(e) => update(c.id, "discount", parseFloat(e.target.value))}
                      className="border border-gray-200 bg-white w-24 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 rounded px-2 py-1"
                    />
                  </td>
                  <td className="px-4 py-2">
                    <input
                      key={`discount_total-${c.id}-${c.discount_total}`}
                      type="number"
                      defaultValue={c.discount_total}
                      onBlur={(e) => update(c.id, "discount_total", parseFloat(e.target.value))}
                      className="border border-gray-200 bg-white w-32 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 rounded px-2 py-1"
                    />
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button onClick={() => remove(c.id)} className="text-red-400 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
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
