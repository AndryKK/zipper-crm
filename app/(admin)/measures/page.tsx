"use client";
import { useEffect, useState } from "react";
import { Header } from "@/components/admin/header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Plus, Trash2, Check } from "lucide-react";
import { apiFetch } from "@/lib/api";

export default function MeasuresPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [measures, setMeasures] = useState<any[]>([]);
  const [newTitle, setNewTitle] = useState("");
  const [newShort, setNewShort] = useState("");

  useEffect(() => {
    apiFetch<any[]>("/api/measures").then((data) => { if (data) setMeasures(data); });
  }, []);

  async function add() {
    if (!newTitle.trim()) return;
    const res = await fetch("/api/measures", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: newTitle, short_title: newShort, lang: "uk" }) });
    const created = await res.json();
    setMeasures((p) => [...p, created]);
    setNewTitle(""); setNewShort("");
    toast.success("Додано!");
  }

  async function update(id: number, field: string, value: string) {
    await fetch(`/api/measures/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ [field]: value }) });
    toast.success("Збережено!");
  }

  async function remove(id: number) {
    if (!confirm("Видалити?")) return;
    await fetch(`/api/measures/${id}`, { method: "DELETE" });
    setMeasures((p) => p.filter((m) => m.id !== id));
  }

  return (
    <>
      <Header title="Одиниці виміру" />
      <div className="p-6 max-w-xl space-y-4">
        <div className="flex gap-2">
          <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Назва (наприклад: Кілограм)" />
          <Input value={newShort} onChange={(e) => setNewShort(e.target.value)} placeholder="Скорочення (кг)" className="w-32" />
          <Button onClick={add}><Plus className="h-4 w-4" /></Button>
        </div>
        <div className="rounded-md border overflow-hidden bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Назва</th>
                <th className="px-4 py-2 text-left font-medium">Скорочення</th>
                <th className="px-4 py-2 text-right font-medium">Дії</th>
              </tr>
            </thead>
            <tbody>
              {measures.map((m) => (
                <tr key={m.id} className="border-t hover:bg-gray-50">
                  <td className="px-4 py-2">
                    <input defaultValue={m.title} onBlur={(e) => update(m.id, "title", e.target.value)} className="border-0 bg-transparent w-full focus:outline-none focus:ring-1 focus:ring-blue-500 rounded px-1" />
                  </td>
                  <td className="px-4 py-2">
                    <input defaultValue={m.short_title} onBlur={(e) => update(m.id, "short_title", e.target.value)} className="border-0 bg-transparent w-24 focus:outline-none focus:ring-1 focus:ring-blue-500 rounded px-1" />
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
