"use client";
import { useEffect, useState } from "react";
import { Header } from "@/components/admin/header";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { apiFetch } from "@/lib/api";

export default function LangsPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [langs, setLangs] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiFetch<any[]>("/api/langs").then((data) => { if (data) setLangs(data); });
  }, []);

  function update(id: number, field: string, value: number) {
    setLangs((p) => p.map((l) => l.id === id ? { ...l, [field]: value } : l));
  }

  async function save() {
    setSaving(true);
    await fetch("/api/langs", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(langs) });
    toast.success("Збережено!");
    setSaving(false);
  }

  return (
    <>
      <Header title="Мови" />
      <div className="p-4 md:p-6 max-w-xl space-y-4">
        {/* ── Mobile cards (< md) ────────────────────────────────────── */}
        <div className="md:hidden space-y-3">
          {langs.map((l) => (
            <div key={l.id} className="crm-card" style={{ padding: 14 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
                <div style={{ fontWeight: 600 }}>{l.title}</div>
                <span className="font-mono" style={{ fontSize: 12, color: "var(--text-muted)" }}>{l.code}</span>
              </div>
              <div style={{ display: "flex", gap: 20 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, cursor: "pointer" }}>
                  <input type="checkbox" checked={!!l.active} onChange={(e) => update(l.id, "active", e.target.checked ? 1 : 0)} className="h-4 w-4" />
                  Активна
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, cursor: "pointer" }}>
                  <input type="checkbox" checked={!!l.visibility} onChange={(e) => update(l.id, "visibility", e.target.checked ? 1 : 0)} className="h-4 w-4" />
                  Видима
                </label>
              </div>
            </div>
          ))}
        </div>

        {/* ── Desktop table (>= md) ─────────────────────────────────── */}
        <div className="rounded-md border overflow-hidden bg-white hidden md:block">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Назва</th>
                <th className="px-4 py-2 text-left font-medium w-20">Код</th>
                <th className="px-4 py-2 text-left font-medium w-24">Активна</th>
                <th className="px-4 py-2 text-left font-medium w-24">Видима</th>
              </tr>
            </thead>
            <tbody>
              {langs.map((l) => (
                <tr key={l.id} className="border-t hover:bg-gray-50">
                  <td className="px-4 py-2">{l.title}</td>
                  <td className="px-4 py-2 font-mono text-gray-500">{l.code}</td>
                  <td className="px-4 py-2">
                    <input type="checkbox" checked={!!l.active} onChange={(e) => update(l.id, "active", e.target.checked ? 1 : 0)} className="h-4 w-4" />
                  </td>
                  <td className="px-4 py-2">
                    <input type="checkbox" checked={!!l.visibility} onChange={(e) => update(l.id, "visibility", e.target.checked ? 1 : 0)} className="h-4 w-4" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Button onClick={save} disabled={saving} className="w-full sm:w-auto">
          {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Зберегти
        </Button>
      </div>
    </>
  );
}
