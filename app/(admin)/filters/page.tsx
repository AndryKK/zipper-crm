"use client";
import { useEffect, useState } from "react";
import { Header } from "@/components/admin/header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Plus, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import { apiFetch } from "@/lib/api";

type Category = { id: number; translationId: number; pid: number; title: string; lang: string; priority?: number };

function buildCategoryTree(categories: Category[]) {
  const byPid = new Map<number, Category[]>();
  for (const c of categories) {
    const list = byPid.get(c.pid) ?? [];
    list.push(c);
    byPid.set(c.pid, list);
  }
  for (const list of byPid.values()) {
    list.sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0) || a.title.localeCompare(b.title));
  }
  const result: { cat: Category; depth: number }[] = [];
  function walk(pid: number, depth: number) {
    for (const cat of byPid.get(pid) ?? []) {
      result.push({ cat, depth });
      walk(cat.translationId, depth + 1);
    }
  }
  walk(0, 0);
  return result;
}

export default function FiltersPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [filters, setFilters] = useState<any[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [expanded, setExpanded] = useState<number[]>([]);
  const [newFilter, setNewFilter] = useState("");
  const [newValues, setNewValues] = useState<Record<number, string>>({});
  const [groupCategoryIds, setGroupCategoryIds] = useState<Record<number, number[]>>({});
  const [savingCategories, setSavingCategories] = useState<number | null>(null);

  useEffect(() => {
    apiFetch<any[]>("/api/filters").then((data) => { if (data) setFilters(data); });
    apiFetch<any[]>("/api/categories").then((data) => {
      if (data) setCategories(data.filter((c: any) => c.lang === "uk"));
    });
  }, []);

  async function toggleExpand(filterId: number) {
    const isExpanding = !expanded.includes(filterId);
    setExpanded((p) => (p.includes(filterId) ? p.filter((i) => i !== filterId) : [...p, filterId]));
    if (isExpanding && !(filterId in groupCategoryIds)) {
      const res = await apiFetch<{ categoryIds: number[] }>(`/api/filters/${filterId}/categories`);
      setGroupCategoryIds((p) => ({ ...p, [filterId]: res?.categoryIds ?? [] }));
    }
  }

  function toggleGroupCategory(filterId: number, catTranslationId: number, checked: boolean) {
    setGroupCategoryIds((p) => {
      const current = p[filterId] ?? [];
      return {
        ...p,
        [filterId]: checked ? [...current, catTranslationId] : current.filter((x) => x !== catTranslationId),
      };
    });
  }

  async function saveGroupCategories(filterId: number) {
    setSavingCategories(filterId);
    try {
      await fetch(`/api/filters/${filterId}/categories`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoryIds: groupCategoryIds[filterId] ?? [] }),
      });
      toast.success("Категорії збережено!");
    } finally {
      setSavingCategories(null);
    }
  }

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

  const categoryTree = buildCategoryTree(categories);

  return (
    <>
      <Header title="Фільтри каталогу" />
      <div className="p-6 max-w-3xl space-y-4">
        <Card>
          <CardHeader><CardTitle className="text-sm">Новий фільтр</CardTitle></CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Input value={newFilter} onChange={(e) => setNewFilter(e.target.value)} placeholder="Назва фільтру (напр: Матеріал, Колір...)" onKeyDown={(e) => e.key === "Enter" && addFilter()} />
              <Button onClick={addFilter} className="cursor-pointer"><Plus className="h-4 w-4" /></Button>
            </div>
          </CardContent>
        </Card>

        {filters.map((filter) => (
          <Card key={filter.id}>
            <div className="flex items-center gap-2 p-4">
              <button onClick={() => toggleExpand(filter.id)} className="cursor-pointer">
                {expanded.includes(filter.id) ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </button>
              <span className="font-medium flex-1">{filter.title}</span>
              <span className="text-xs text-gray-400">{filter.filters?.length ?? 0} значень</span>
              <button onClick={() => deleteFilter(filter.id)} className="text-red-400 hover:text-red-600 cursor-pointer">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            {expanded.includes(filter.id) && (
              <CardContent className="pt-0 space-y-4">
                <div>
                  <div className="pl-6 space-y-1 mb-3">
                    {filter.filters?.map((val: { id: number; title: string }) => (
                      <div key={val.id} className="flex items-center gap-2 py-1">
                        <span className="text-sm flex-1">{val.title}</span>
                        <button onClick={() => deleteValue(filter.id, val.id)} className="text-gray-300 hover:text-red-500 cursor-pointer"><Trash2 className="h-3.5 w-3.5" /></button>
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
                    <Button size="sm" onClick={() => addValue(filter.id)} className="cursor-pointer"><Plus className="h-3.5 w-3.5" /></Button>
                  </div>
                </div>

                <div className="border-t pt-3">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2 pl-6">
                    Категорії, де показувати цей фільтр
                  </p>
                  <div className="pl-6 max-h-64 overflow-y-auto border rounded-md p-2 space-y-0.5">
                    {categoryTree.length === 0 && <p className="text-sm text-gray-400 px-1">Завантаження категорій...</p>}
                    {categoryTree.map(({ cat, depth }) => (
                      <label key={cat.translationId} className="flex items-center gap-1.5 text-sm py-0.5 cursor-pointer" style={{ paddingLeft: depth * 16 }}>
                        <input
                          type="checkbox"
                          className="h-3.5 w-3.5 rounded border-gray-300"
                          checked={(groupCategoryIds[filter.id] ?? []).includes(cat.translationId)}
                          onChange={(e) => toggleGroupCategory(filter.id, cat.translationId, e.target.checked)}
                        />
                        {cat.title}
                      </label>
                    ))}
                  </div>
                  <div className="pl-6 mt-2">
                    <Button size="sm" variant="outline" disabled={savingCategories === filter.id} onClick={() => saveGroupCategories(filter.id)} className="cursor-pointer disabled:cursor-default">
                      {savingCategories === filter.id ? "Збереження..." : "Зберегти категорії"}
                    </Button>
                  </div>
                </div>
              </CardContent>
            )}
          </Card>
        ))}
      </div>
    </>
  );
}
