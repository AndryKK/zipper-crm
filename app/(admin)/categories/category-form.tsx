"use client";
import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { transliterate, getImgUrl } from "@/lib/utils";
import { Loader2, Upload, Filter as FilterIcon } from "lucide-react";
interface Props {
  category?: any | null;
  parentCategories: any[];
  initialPid?: number;
}

export function CategoryForm({ category, parentCategories, initialPid = 0 }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [imgUploading, setImgUploading] = useState(false);
  const [imgNewShopUploading, setImgNewShopUploading] = useState(false);
  const [currentImg, setCurrentImg] = useState(category?.img ?? "");
  const [currentImgNewShop, setCurrentImgNewShop] = useState(category?.image_new_shop ?? "");
  const imgInputRef = useRef<HTMLInputElement>(null);
  const imgNewShopInputRef = useRef<HTMLInputElement>(null);
  const isNew = !category;

  // Which filter groups (all_filters, e.g. "Колір тасьми") show on this
  // category's storefront page — the reverse of the same all_filters_items
  // link the Filters admin page edits per-group. Both the group list and
  // this category's current selection are fetched lazily, only the first
  // time the popup is actually opened, not on page load.
  const [showFiltersDialog, setShowFiltersDialog] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [filterGroups, setFilterGroups] = useState<any[] | null>(null);
  const [selectedFilterIds, setSelectedFilterIds] = useState<number[] | null>(null);
  const [loadingFilters, setLoadingFilters] = useState(false);
  const [savingFilters, setSavingFilters] = useState(false);

  async function openFiltersDialog() {
    setShowFiltersDialog(true);
    if (filterGroups !== null && selectedFilterIds !== null) return;
    setLoadingFilters(true);
    try {
      const [groupsRes, linksRes] = await Promise.all([
        filterGroups ?? fetch("/api/filters?groupsOnly=1").then((r) => r.json()),
        fetch(`/api/categories/${category.id}/filters`).then((r) => r.json()),
      ]);
      setFilterGroups(groupsRes ?? []);
      setSelectedFilterIds(linksRes?.filterIds ?? []);
    } finally {
      setLoadingFilters(false);
    }
  }

  function toggleFilterGroup(translationId: number, checked: boolean) {
    setSelectedFilterIds((prev) => {
      const current = prev ?? [];
      return checked ? [...current, translationId] : current.filter((x) => x !== translationId);
    });
  }

  async function saveFilters() {
    setSavingFilters(true);
    try {
      await fetch(`/api/categories/${category.id}/filters`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filterIds: selectedFilterIds ?? [] }),
      });
      toast.success("Фільтри збережено!");
      setShowFiltersDialog(false);
    } finally {
      setSavingFilters(false);
    }
  }

  const [form, setForm] = useState({
    title: category?.title ?? "",
    uri: category?.uri ?? "",
    pid: category?.pid ?? initialPid,
    visibility: category?.visibility ?? 1,
    priority: category?.priority ?? 0,
    discount: category?.discount ?? "",
    descr: category?.descr ?? "",
    text: category?.text ?? "",
    seoTitle: category?.seoTitle ?? "",
    seoKey: category?.seoKey ?? "",
    seoDescr: category?.seoDescr ?? "",
  });

  const set = (k: string, v: unknown) => setForm((prev) => ({ ...prev, [k]: v }));

  async function uploadImg(file: File) {
    if (!category) return;
    setImgUploading(true);
    const fd = new FormData();
    fd.append("img", file);
    const res = await fetch(`/api/categories/${category.id}/image`, { method: "POST", body: fd });
    if (res.ok) {
      const data = await res.json();
      setCurrentImg(data.img);
      toast.success("Фото оновлено!");
    } else {
      toast.error("Помилка завантаження");
    }
    setImgUploading(false);
  }

  async function uploadImgNewShop(file: File) {
    if (!category) return;
    setImgNewShopUploading(true);
    const fd = new FormData();
    fd.append("img", file);
    const res = await fetch(`/api/categories/${category.id}/image?field=image_new_shop`, { method: "POST", body: fd });
    if (res.ok) {
      const data = await res.json();
      setCurrentImgNewShop(data.image_new_shop);
      toast.success("Фото нового магазину оновлено!");
    } else {
      toast.error("Помилка завантаження");
    }
    setImgNewShopUploading(false);
  }

  async function save() {
    setSaving(true);
    try {
      const payload = {
        ...form,
        pid: parseInt(String(form.pid)) || 0,
        visibility: parseInt(String(form.visibility)),
        priority: parseInt(String(form.priority)) || 0,
        discount: form.discount !== "" ? parseFloat(String(form.discount)) : null,
        lang: "uk",
      };

      if (isNew) {
        const res = await fetch("/api/categories", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const created = await res.json();
        toast.success("Категорію створено!");
        router.push(`/categories/${created.id}`);
      } else {
        await fetch(`/api/categories/${category.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        toast.success("Збережено!");
        router.refresh();
      }
    } catch {
      toast.error("Помилка збереження");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6 max-w-2xl space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Назва *</Label>
          <Input value={form.title} onChange={(e) => {
            set("title", e.target.value);
            if (isNew) set("uri", transliterate(e.target.value));
          }} />
        </div>
        <div className="space-y-1.5">
          <Label>URI (slug)</Label>
          <Input value={form.uri} onChange={(e) => set("uri", e.target.value)} />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-1.5">
          <Label>Батьківська категорія</Label>
          <Select value={String(form.pid)} onValueChange={(v) => set("pid", parseInt(v))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="0">— Коренева —</SelectItem>
              {parentCategories.map((p) => (
                <SelectItem key={p.id} value={String(p.translationId)}>
                  {p._depth > 0 ? " ".repeat(p._depth * 3) + "└ " + p.title : p.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Видимість</Label>
          <Select value={String(form.visibility)} onValueChange={(v) => set("visibility", parseInt(v))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="1">Видима</SelectItem>
              <SelectItem value="0">Прихована</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Знижка (%)</Label>
          <Input type="number" value={form.discount} onChange={(e) => set("discount", e.target.value)} placeholder="0" />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Короткий опис</Label>
        <Textarea rows={2} value={form.descr} onChange={(e) => set("descr", e.target.value)} />
      </div>

      <div className="space-y-1.5">
        <Label>Текст сторінки</Label>
        <Textarea rows={5} value={form.text} onChange={(e) => set("text", e.target.value)} />
      </div>

      {!isNew && (
        <div className="border-t pt-4 space-y-2">
          <p className="text-sm font-medium text-gray-700">Фото категорії</p>
          <div className="flex items-center gap-4">
            {currentImg ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={getImgUrl(currentImg, "categories")} alt="" className="h-20 w-20 rounded object-cover border" />
            ) : (
              <div className="h-20 w-20 rounded bg-gray-100 border flex items-center justify-center text-gray-400 text-xs">Немає</div>
            )}
            <div>
              <input
                ref={imgInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadImg(f); }}
              />
              <Button type="button" variant="outline" size="sm" disabled={imgUploading} onClick={() => imgInputRef.current?.click()}>
                {imgUploading ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Upload className="h-4 w-4 mr-1.5" />}
                {currentImg ? "Замінити фото" : "Завантажити фото"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {!isNew && (
        <div className="border-t pt-4 space-y-2">
          <p className="text-sm font-medium text-gray-700">Фото для нового магазину <span className="text-xs text-gray-400 font-normal">(image_new_shop)</span></p>
          <div className="flex items-center gap-4">
            {currentImgNewShop ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={currentImgNewShop} alt="" className="h-20 w-20 rounded object-cover border" />
            ) : (
              <div className="h-20 w-20 rounded bg-gray-100 border flex items-center justify-center text-gray-400 text-xs">Немає</div>
            )}
            <div>
              <input
                ref={imgNewShopInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadImgNewShop(f); }}
              />
              <Button type="button" variant="outline" size="sm" disabled={imgNewShopUploading} onClick={() => imgNewShopInputRef.current?.click()}>
                {imgNewShopUploading ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Upload className="h-4 w-4 mr-1.5" />}
                {currentImgNewShop ? "Замінити фото" : "Завантажити фото"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {!isNew && (
        <div className="border-t pt-4 space-y-2">
          <p className="text-sm font-medium text-gray-700">Фільтри на цій категорії</p>
          <p className="text-xs text-gray-400">Які фільтри каталогу (напр. Колір тасьми, Довжина) показувати покупцям на цій категорії.</p>
          <Button type="button" variant="outline" size="sm" onClick={openFiltersDialog} className="gap-1.5">
            <FilterIcon className="h-3.5 w-3.5" />
            Налаштувати фільтри{selectedFilterIds ? ` (${selectedFilterIds.length})` : ""}
          </Button>
        </div>
      )}

      <div className="border-t pt-4 space-y-3">
        <p className="text-sm font-medium text-gray-700">SEO</p>
        <div className="space-y-1.5">
          <Label>SEO заголовок</Label>
          <Input value={form.seoTitle} onChange={(e) => set("seoTitle", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>SEO ключові слова</Label>
          <Input value={form.seoKey} onChange={(e) => set("seoKey", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>SEO опис</Label>
          <Textarea rows={2} value={form.seoDescr} onChange={(e) => set("seoDescr", e.target.value)} />
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <Button onClick={save} disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {isNew ? "Створити" : "Зберегти"}
        </Button>
        <Button variant="outline" onClick={() => router.push("/categories")}>Скасувати</Button>
      </div>

      {!isNew && (
        <Dialog open={showFiltersDialog} onOpenChange={setShowFiltersDialog}>
          <DialogContent style={{ maxWidth: 440 }}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FilterIcon className="h-4 w-4" /> Фільтри на категорії «{form.title}»
              </DialogTitle>
            </DialogHeader>
            <p className="text-xs text-gray-400 -mt-1">
              Позначені фільтри показуватимуться покупцям на сторінці цієї категорії.
            </p>

            {loadingFilters ? (
              <div className="py-8 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto text-gray-400" /></div>
            ) : (
              <>
                <div className="max-h-72 overflow-y-auto border rounded-md p-2 space-y-0.5">
                  {(filterGroups ?? []).length === 0 && <p className="text-sm text-gray-400 px-1">Фільтрів ще не створено (розділ «Фільтри каталогу»).</p>}
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {(filterGroups ?? []).map((f: any) => (
                    <label key={f.id} className="flex items-center gap-1.5 text-sm py-1 px-1 cursor-pointer">
                      <input
                        type="checkbox"
                        className="h-3.5 w-3.5 rounded border-gray-300"
                        checked={(selectedFilterIds ?? []).includes(f.translationId)}
                        onChange={(e) => toggleFilterGroup(f.translationId, e.target.checked)}
                      />
                      {f.title}
                    </label>
                  ))}
                </div>
                <div className="flex justify-end gap-2 mt-2">
                  <Button variant="outline" onClick={() => setShowFiltersDialog(false)}>Скасувати</Button>
                  <Button disabled={savingFilters} onClick={saveFilters}>
                    {savingFilters && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                    Зберегти фільтри
                  </Button>
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
