"use client";
import { useEffect, useState } from "react";
import { Header } from "@/components/admin/header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Plus, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import { apiFetch } from "@/lib/api";

export default function FiltersPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [filters, setFilters] = useState<any[]>([]);
  const [expanded, setExpanded] = useState<number[]>([]);
  const [newFilter, setNewFilter] = useState("");
  const [newValues, setNewValues] = useState<Record<number, string>>({});

  useEffect(() => {
    apiFetch<any[]>("/api/filters").then((data) => { if (data) setFilters(data); });
  }, []);

  async function addFilter() {
    if (!newFilter.trim()) return;
    const res = await fetch("/api/filters", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: newFilter, lang: "uk" }) });
    const created = await res.json();
    setFilters((prev) => [...prev, { ...created, filters: [] }]);
    setNewFilter("");
    toast.success("Фільтр додано!");
  }

  async function addValue(filterId: number) {
    const title = newValues[filterId];
    if (!title?.trim()) return;
    const res = await fetch(`/api/filters/${filterId}/values`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, lang: "uk" }) });
    const created = await res.json();
    setFilters((prev) => prev.map((f) => f.id === filterId ? { ...f, filters: [...f.filters, created] } : f));
    setNewValues((prev) => ({ ...prev, [filterId]: "" }));
    toast.success("Значення додано!");
  }

  async function deleteFilter(id: number) {
    if (!confirm("Видалити фільтр та всі його значення?")) return;
    await fetch(`/api/filters/${id}`, { method: "DELETE" });
    setFilters((prev) => prev.filter((f) => f.id !== id));
    toast.success("Видалено!");
  }

  async function deleteValue(filterId: number, valueId: number) {
    await fetch(`/api/filters/${filterId}/values/${valueId}`, { method: "DELETE" });
    setFilters((prev) => prev.map((f) => f.id === filterId ? { ...f, filters: f.filters.filter((v: { id: number }) => v.id !== valueId) } : f));
  }

  return (
    <>
      <Header title="Фільтри каталогу" />
      <div className="p-6 max-w-3xl space-y-4">
        <Card>
          <CardHeader><CardTitle className="text-sm">Новий фільтр</CardTitle></CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Input value={newFilter} onChange={(e) => setNewFilter(e.target.value)} placeholder="Назва фільтру (напр: Матеріал, Колір...)" onKeyDown={(e) => e.key === "Enter" && addFilter()} />
              <Button onClick={addFilter}><Plus className="h-4 w-4" /></Button>
            </div>
          </CardContent>
        </Card>

        {filters.map((filter) => (
          <Card key={filter.id}>
            <div className="flex items-center gap-2 p-4">
              <button onClick={() => setExpanded((p) => p.includes(filter.id) ? p.filter((i) => i !== filter.id) : [...p, filter.id])}>
                {expanded.includes(filter.id) ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </button>
              <span className="font-medium flex-1">{filter.title}</span>
              <span className="text-xs text-gray-400">{filter.filters?.length ?? 0} значень</span>
              <button onClick={() => deleteFilter(filter.id)} className="text-red-400 hover:text-red-600">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            {expanded.includes(filter.id) && (
              <CardContent className="pt-0">
                <div className="pl-6 space-y-1 mb-3">
                  {filter.filters?.map((val: { id: number; title: string }) => (
                    <div key={val.id} className="flex items-center gap-2 py-1">
                      <span className="text-sm flex-1">{val.title}</span>
                      <button onClick={() => deleteValue(filter.id, val.id)} className="text-gray-300 hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2 pl-6">
                  <Input
                    value={newValues[filter.id] ?? ""}
                    onChange={(e) => setNewValues((p) => ({ ...p, [filter.id]: e.target.value }))}
                    placeholder="Нове значення..."
                    className="text-sm"
                    onKeyDown={(e) => e.key === "Enter" && addValue(filter.id)}
                  />
                  <Button size="sm" onClick={() => addValue(filter.id)}><Plus className="h-3.5 w-3.5" /></Button>
                </div>
              </CardContent>
            )}
          </Card>
        ))}
      </div>
    </>
  );
}
