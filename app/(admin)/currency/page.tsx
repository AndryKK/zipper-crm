"use client";
import { useEffect, useState } from "react";
import { Header } from "@/components/admin/header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { apiFetch } from "@/lib/api";

export default function CurrencyPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [currencies, setCurrencies] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiFetch<any[]>("/api/currency").then((data) => { if (data) setCurrencies(data); });
  }, []);

  function update(id: number, field: string, value: number) {
    setCurrencies((p) => p.map((c) => c.id === id ? { ...c, [field]: value } : c));
  }

  async function save() {
    setSaving(true);
    await fetch("/api/currency", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(currencies) });
    toast.success("Збережено!");
    setSaving(false);
  }

  return (
    <>
      <Header title="Валюти" />
      <div className="p-6 max-w-xl space-y-4">
        <div className="rounded-md border overflow-hidden bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Назва</th>
                <th className="px-4 py-2 text-left font-medium w-20">URI</th>
                <th className="px-4 py-2 text-left font-medium w-28">Курс</th>
                <th className="px-4 py-2 text-left font-medium w-24">Активна</th>
              </tr>
            </thead>
            <tbody>
              {currencies.map((c) => (
                <tr key={c.id} className="border-t hover:bg-gray-50">
                  <td className="px-4 py-2">{c.title}</td>
                  <td className="px-4 py-2 font-mono text-gray-500">{c.uri}</td>
                  <td className="px-4 py-2">
                    <Input type="number" step="0.0001" value={c.rate} onChange={(e) => update(c.id, "rate", parseFloat(e.target.value))} className="h-8 w-24" />
                  </td>
                  <td className="px-4 py-2">
                    <input type="checkbox" checked={!!c.enabled} onChange={(e) => update(c.id, "enabled", e.target.checked ? 1 : 0)} className="h-4 w-4" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Button onClick={save} disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Зберегти
        </Button>
      </div>
    </>
  );
}
