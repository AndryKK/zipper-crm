"use client";
import { useEffect, useState } from "react";
import { Header } from "@/components/admin/header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Trash2, ChevronDown, ChevronRight, FolderTree, Loader2, GripVertical } from "lucide-react";
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
  const [expanded, setExpanded] = useState<number[]>([]);
  const [newFilter, setNewFilter] = useState("");
  const [newValues, setNewValues] = useState<Record<number, string>>({});

  // Category tree is fetched once, lazily — only the first time any
  // "На яких категоріях" popup is actually opened, not on page load.
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [loadingCategories, setLoadingCategories] = useState(false);

  // Popup state: which filter group's category assignment is open, its
  // current selection (fetched lazily on open, one request per group —
  // never for groups you don't click into), and save-in-flight flag.
  const [categoriesDialogFor, setCategoriesDialogFor] = useState<{ id: number; title: string } | null>(null);
  const [groupCategoryIds, setGroupCategoryIds] = useState<Record<number, number[]>>({});
  const [loadingGroupCategories, setLoadingGroupCategories] = useState(false);
  const [savingCategories, setSavingCategories] = useState(false);

  // Drag-and-drop reordering of one filter group's values — native HTML5
  // DnD (no library dependency for a plain linear-list reorder). The
  // dragged value's own id travels in the drop event itself
  // (dataTransfer), not React state, so a drop is self-contained even if
  // this component re-rendered mid-drag.
  const [dragOverValueId, setDragOverValueId] = useState<number | null>(null);

  function reorderValues(filterId: number, draggedId: number, targetId: number) {
    if (draggedId === targetId) return;
    setFilters((prev) =>
      prev.map((f) => {
        if (f.id !== filterId) return f;
        const list = [...f.filters];
        const fromIndex = list.findIndex((v: { id: number }) => v.id === draggedId);
        const toIndex = list.findIndex((v: { id: number }) => v.id === targetId);
        if (fromIndex === -1 || toIndex === -1) return f;
        const [moved] = list.splice(fromIndex, 1);
        list.splice(toIndex, 0, moved);
        persistValueOrder(list.map((v: { id: number }) => v.id));
        return { ...f, filters: list };
      })
    );
  }

  // Fire-and-forget (optimistic UI already reflects the new order) — a
  // failure here just means the next page load reverts to the last
  // successfully saved order, not a broken/stuck list.
  async function persistValueOrder(orderedIds: number[]) {
    try {
      await fetch(`/api/filters/values/reorder`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderedIds }),
      });
    } catch {
      toast.error("Не вдалося зберегти порядок");
    }
  }

  useEffect(() => {
    apiFetch<any[]>("/api/filters").then((data) => { if (data) setFilters(data); });
  }, []);

  async function toggleExpand(filterId: number) {
    setExpanded((p) => (p.includes(filterId) ? p.filter((i) => i !== filterId) : [...p, filterId]));
  }

  async function openCategoriesDialog(filter: { id: number; title: string }) {
    setCategoriesDialogFor(filter);
    setLoadingGroupCategories(true);
    try {
      const [categoriesRes, linksRes] = await Promise.all([
        categories ? Promise.resolve(categories) : (async () => {
          setLoadingCategories(true);
          const data = await apiFetch<Category[]>("/api/categories?lang=uk");
          setLoadingCategories(false);
          const list = data ?? [];
          setCategories(list);
          return list;
        })(),
        groupCategoryIds[filter.id] !== undefined
          ? Promise.resolve(groupCategoryIds[filter.id])
          : apiFetch<{ categoryIds: number[] }>(`/api/filters/${filter.id}/categories`).then((r) => r?.categoryIds ?? []),
      ]);
      void categoriesRes;
      setGroupCategoryIds((p) => ({ ...p, [filter.id]: linksRes }));
    } finally {
      setLoadingGroupCategories(false);
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

  async function saveGroupCategories() {
    if (!categoriesDialogFor) return;
    const filterId = categoriesDialogFor.id;
    setSavingCategories(true);
    try {
      await fetch(`/api/filters/${filterId}/categories`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoryIds: groupCategoryIds[filterId] ?? [] }),
      });
      toast.success("Категорії збережено!");
      setCategoriesDialogFor(null);
    } finally {
      setSavingCategories(false);
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

  const categoryTree = categories ? buildCategoryTree(categories) : [];
  const dialogCategoryIds = categoriesDialogFor ? (groupCategoryIds[categoriesDialogFor.id] ?? []) : [];

  return (
    <>
      <Header title="Фільтри каталогу" />
      <div className="p-4 md:p-6 max-w-3xl space-y-4">
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
            {/* Chevron+title stay on their own line (title truncates via
                min-w-0 instead of forcing the row wider than the card —
                it had no min-width before, so a long title just pushed
                the trailing count/"Категорії"/delete cluster straight off
                the card's right edge on a phone). That cluster now wraps
                onto its own second line below `sm` (basis-full) instead;
                at `sm`+ it's basis-auto/flex-nowrap, the exact original
                single-line row. */}
            <div className="flex items-center gap-2 flex-wrap p-4">
              <button onClick={() => toggleExpand(filter.id)} className="cursor-pointer">
                {expanded.includes(filter.id) ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </button>
              <span className="font-medium flex-1 min-w-0 truncate">{filter.title}</span>
              <div className="flex items-center gap-2 flex-wrap basis-full sm:basis-auto sm:flex-nowrap sm:w-auto">
                <span className="text-xs text-gray-400">{filter.filters?.length ?? 0} значень</span>
                <Button
                  variant="outline" size="sm"
                  onClick={() => openCategoriesDialog(filter)}
                  className="cursor-pointer h-7 text-xs gap-1.5"
                >
                  <FolderTree className="h-3.5 w-3.5" /> Категорії
                </Button>
                <button onClick={() => deleteFilter(filter.id)} className="text-red-400 hover:text-red-600 cursor-pointer">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
            {expanded.includes(filter.id) && (
              <CardContent className="pt-0">
                <div className="pl-6 space-y-1 mb-3">
                  {filter.filters?.map((val: { id: number; title: string }) => (
                    <div
                      key={val.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/plain", String(val.id));
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        if (dragOverValueId !== val.id) setDragOverValueId(val.id);
                      }}
                      onDragLeave={() => setDragOverValueId((p) => (p === val.id ? null : p))}
                      onDrop={(e) => {
                        e.preventDefault();
                        setDragOverValueId(null);
                        const draggedId = parseInt(e.dataTransfer.getData("text/plain"), 10);
                        if (!Number.isNaN(draggedId)) reorderValues(filter.id, draggedId, val.id);
                      }}
                      onDragEnd={() => setDragOverValueId(null)}
                      className={`flex items-center gap-2 py-1 rounded ${dragOverValueId === val.id ? "bg-violet-500/10 outline-1 outline-dashed outline-violet-400" : ""}`}
                    >
                      <span className="text-gray-500 cursor-grab active:cursor-grabbing shrink-0" title="Перетягніть, щоб змінити порядок">
                        <GripVertical className="h-3.5 w-3.5" />
                      </span>
                      <span className="text-sm flex-1 min-w-0 truncate">{val.title}</span>
                      <button onClick={() => deleteValue(filter.id, val.id)} className="text-gray-300 hover:text-red-500 cursor-pointer shrink-0"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2 pl-6">
                  <Input
                    value={newValues[filter.id] ?? ""}
                    onChange={(e) => setNewValues((p) => ({ ...p, [filter.id]: e.target.value }))}
                    placeholder="Нове значення..."
                    className="text-sm min-w-0"
                    onKeyDown={(e) => e.key === "Enter" && addValue(filter.id)}
                  />
                  <Button size="sm" onClick={() => addValue(filter.id)} className="cursor-pointer shrink-0"><Plus className="h-3.5 w-3.5" /></Button>
                </div>
              </CardContent>
            )}
          </Card>
        ))}
      </div>

      <Dialog open={!!categoriesDialogFor} onOpenChange={(open) => !open && setCategoriesDialogFor(null)}>
        <DialogContent style={{ maxWidth: 460 }}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FolderTree className="h-4 w-4" /> Категорії фільтра «{categoriesDialogFor?.title}»
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-gray-400 -mt-1">
            На яких категоріях каталогу показувати цей фільтр покупцям.
          </p>

          {loadingGroupCategories || loadingCategories ? (
            <div className="py-8 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto text-gray-400" /></div>
          ) : (
            <>
              <div className="max-h-72 overflow-y-auto border rounded-md p-2 space-y-0.5">
                {categoryTree.length === 0 && <p className="text-sm text-gray-400 px-1">Категорій не знайдено</p>}
                {categoryTree.map(({ cat, depth }) => (
                  <label key={cat.translationId} className="flex items-center gap-1.5 text-sm py-0.5 cursor-pointer" style={{ paddingLeft: depth * 16 }}>
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5 rounded border-gray-300"
                      checked={dialogCategoryIds.includes(cat.translationId)}
                      onChange={(e) => categoriesDialogFor && toggleGroupCategory(categoriesDialogFor.id, cat.translationId, e.target.checked)}
                    />
                    {cat.title}
                  </label>
                ))}
              </div>
              <div className="flex justify-end gap-2 mt-2">
                <Button variant="outline" onClick={() => setCategoriesDialogFor(null)}>Скасувати</Button>
                <Button disabled={savingCategories} onClick={saveGroupCategories} className="cursor-pointer disabled:cursor-default">
                  {savingCategories && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                  Зберегти категорії
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
