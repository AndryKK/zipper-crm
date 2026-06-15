"use client";
import { useEffect, useState } from "react";
import { Header } from "@/components/admin/header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Search, Loader2 } from "lucide-react";
import { apiFetch } from "@/lib/api";

export default function CustomStringsPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [strings, setStrings] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiFetch<any[]>("/api/custom-strings").then((data) => { if (data) setStrings(data); });
  }, []);

  const filtered = strings.filter((s) => !q || s.value.includes(q) || s.text.includes(q));

  const update = (id: number, text: string) => setStrings((prev) => prev.map((s) => s.id === id ? { ...s, text } : s));

  async function save() {
    setSaving(true);
    await fetch("/api/custom-strings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(strings.map((s) => ({ value: s.value, text: s.text, lang: s.lang }))) });
    toast.success("Збережено!");
    setSaving(false);
  }

  return (
    <>
      <Header title="Тексти інтерфейсу" />
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="relative max-w-xs">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Пошук..." className="pl-9" />
          </div>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Зберегти всі зміни
          </Button>
        </div>
        <div className="rounded-md border overflow-hidden bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600 w-1/3">Ключ</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Текст</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.id} className="border-t hover:bg-gray-50">
                  <td className="px-4 py-2 font-mono text-xs text-gray-500">{s.value}</td>
                  <td className="px-4 py-2">
                    <input
                      value={s.text}
                      onChange={(e) => update(s.id, e.target.value)}
                      className="w-full border-0 bg-transparent focus:outline-none focus:ring-1 focus:ring-blue-500 rounded px-1 text-sm"
                    />
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
