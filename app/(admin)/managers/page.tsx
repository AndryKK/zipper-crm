"use client";
import { useEffect, useState } from "react";
import { Header } from "@/components/admin/header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { apiFetch } from "@/lib/api";

export default function ManagersPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [managers, setManagers] = useState<any[]>([]);
  const [form, setForm] = useState({ title: "", phone: "", email: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiFetch<any[]>("/api/managers").then((data) => { if (data) setManagers(data); });
  }, []);

  async function add() {
    if (!form.title.trim()) return;
    setSaving(true);
    const res = await fetch("/api/managers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const created = await res.json();
    setManagers((p) => [...p, created]);
    setForm({ title: "", phone: "", email: "" });
    toast.success("Менеджера додано!");
    setSaving(false);
  }

  async function update(id: number, field: string, value: string) {
    await fetch(`/api/managers/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ [field]: value }) });
    toast.success("Збережено!");
  }

  async function remove(id: number) {
    if (!confirm("Видалити менеджера?")) return;
    await fetch(`/api/managers/${id}`, { method: "DELETE" });
    setManagers((p) => p.filter((m) => m.id !== id));
  }

  return (
    <>
      <Header title="Менеджери" />
      <div className="p-6 space-y-6 max-w-3xl">
        <div className="rounded-md border bg-white p-4 space-y-3">
          <h3 className="font-medium text-sm">Додати менеджера</h3>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label>ПІБ / Назва *</Label>
              <Input value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Телефон</Label>
              <Input value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} />
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
                <th className="px-4 py-2 text-left font-medium">ПІБ / Назва</th>
                <th className="px-4 py-2 text-left font-medium">Телефон</th>
                <th className="px-4 py-2 text-left font-medium">Email</th>
                <th className="px-4 py-2 text-right font-medium w-16">Дії</th>
              </tr>
            </thead>
            <tbody>
              {managers.map((m) => (
                <tr key={m.id} className="border-t hover:bg-gray-50">
                  <td className="px-4 py-2">
                    <input defaultValue={m.title} onBlur={(e) => update(m.id, "title", e.target.value)} className="border-0 bg-transparent w-full focus:outline-none focus:ring-1 focus:ring-blue-500 rounded px-1" />
                  </td>
                  <td className="px-4 py-2">
                    <input defaultValue={m.phone ?? ""} onBlur={(e) => update(m.id, "phone", e.target.value)} className="border-0 bg-transparent w-full focus:outline-none focus:ring-1 focus:ring-blue-500 rounded px-1" />
                  </td>
                  <td className="px-4 py-2">
                    <input defaultValue={m.email ?? ""} onBlur={(e) => update(m.id, "email", e.target.value)} className="border-0 bg-transparent w-full focus:outline-none focus:ring-1 focus:ring-blue-500 rounded px-1" />
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
