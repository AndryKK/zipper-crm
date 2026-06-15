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
  const [form, setForm] = useState({ title: "", discount: 0 });
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
    setForm({ title: "", discount: 0 });
    toast.success("Категорію додано!");
    setSaving(false);
  }

  async function update(id: number, field: string, value: string | number) {
    await fetch(`/api/user-categories/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ [field]: value }) });
    toast.success("Збережено!");
  }

  async function remove(id: number) {
    if (!confirm("Видалити категорію?")) return;
    await fetch(`/api/user-categories/${id}`, { method: "DELETE" });
    setCats((p) => p.filter((c) => c.id !== id));
  }

  return (
    <>
      <Header title="Категорії клієнтів" />
      <div className="p-6 space-y-6 max-w-xl">
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
                <th className="px-4 py-2 text-right font-medium w-16">Дії</th>
              </tr>
            </thead>
            <tbody>
              {cats.map((c) => (
                <tr key={c.id} className="border-t hover:bg-gray-50">
                  <td className="px-4 py-2">
                    <input defaultValue={c.title} onBlur={(e) => update(c.id, "title", e.target.value)} className="border-0 bg-transparent w-full focus:outline-none focus:ring-1 focus:ring-blue-500 rounded px-1" />
                  </td>
                  <td className="px-4 py-2">
                    <input type="number" defaultValue={c.discount} onBlur={(e) => update(c.id, "discount", parseFloat(e.target.value))} className="border-0 bg-transparent w-24 focus:outline-none focus:ring-1 focus:ring-blue-500 rounded px-1" />
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
