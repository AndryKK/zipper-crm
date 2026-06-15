"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { transliterate } from "@/lib/utils";
import { Loader2, Plus, Trash2, X } from "lucide-react";
import type {
  Product, Category, Measure, AllFilter, AllFilterFilter, Lang,
  ProductCategory, ProductPhoto, ProductPhoto2, ProductChar,
  ProductColor, ProductTogether,
} from "@/app/generated/prisma";

type ProductWithRelations = Product & {
  categories?: ProductCategory[];
  photos?: ProductPhoto[];
  photos2?: ProductPhoto2[];
  chars?: ProductChar[];
  colors?: (ProductColor & { productWith: { id: number; title: string; img: string | null } })[];
  together?: (ProductTogether & { productWith: { id: number; title: string; img: string | null } })[];
};

type AllFilterWithChildren = AllFilter & { filters: AllFilterFilter[] };

interface Props {
  product?: ProductWithRelations;
  categories: Category[];
  measures: Measure[];
  filters: AllFilterWithChildren[];
  langs: Lang[];
  mode: "create" | "edit";
}

export function ProductForm({ product, categories, measures, filters, langs, mode }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("main");

  const [form, setForm] = useState({
    title: product?.title ?? "",
    main_title: product?.main_title ?? "",
    pcode: product?.pcode ?? "",
    uri: product?.uri ?? "",
    price: product?.price ?? 0,
    price_sale: product?.price_sale ?? "",
    price2: product?.price2 ?? "",
    price2n: product?.price2n ?? "",
    price3: product?.price3 ?? "",
    price3n: product?.price3n ?? "",
    minquantity: product?.minquantity ?? 1,
    measure: product?.measure ?? "",
    active: product?.active ?? 1,
    labelAction: product?.labelAction ?? 0,
    popular: product?.popular ?? 0,
    priority: product?.priority ?? 0,
    descr: product?.descr ?? "",
    heading: product?.heading ?? "",
    text: product?.text ?? "",
    seoTitle: product?.seoTitle ?? "",
    seoKey: product?.seoKey ?? "",
    seoDescr: product?.seoDescr ?? "",
    lang: product?.lang ?? langs[0]?.code ?? "uk",
  });

  const [selectedCategories, setSelectedCategories] = useState<number[]>(
    product?.categories?.map((c) => c.cid) ?? []
  );
  const [selectedFilters, setSelectedFilters] = useState<number[]>([]);
  const [chars, setChars] = useState<{ title: string; value: string }[]>(
    product?.chars?.map((c) => ({ title: c.title, value: c.value ?? "" })) ?? []
  );

  const set = (k: string, v: unknown) => setForm((prev) => ({ ...prev, [k]: v }));

  async function save() {
    setSaving(true);
    try {
      const payload = {
        ...form,
        price: parseFloat(String(form.price)) || 0,
        price_sale: form.price_sale !== "" ? parseFloat(String(form.price_sale)) : null,
        price2: form.price2 !== "" ? parseFloat(String(form.price2)) : null,
        price2n: form.price2n !== "" ? parseFloat(String(form.price2n)) : null,
        price3: form.price3 !== "" ? parseFloat(String(form.price3)) : null,
        price3n: form.price3n !== "" ? parseFloat(String(form.price3n)) : null,
        measure: form.measure !== "" ? parseInt(String(form.measure)) : null,
        categoryIds: selectedCategories,
        filterIds: selectedFilters,
      };

      let savedProduct: Product;
      if (mode === "create") {
        const res = await fetch("/api/products", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        savedProduct = await res.json();
      } else {
        const res = await fetch(`/api/products/${product!.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        savedProduct = await res.json();
      }

      if (chars.length && mode === "edit") {
        await fetch(`/api/products/${product!.id}/chars`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chars, lang: form.lang }),
        });
      }

      toast.success(mode === "create" ? "Товар створено!" : "Збережено!");
      if (mode === "create") router.push(`/products/${savedProduct.id}`);
      else router.refresh();
    } catch {
      toast.error("Помилка збереження");
    } finally {
      setSaving(false);
    }
  }

  const tabs = [
    { id: "main", label: "Основне" },
    { id: "prices", label: "Ціни" },
    { id: "categories", label: "Категорії" },
    { id: "filters", label: "Фільтри" },
    { id: "chars", label: "Характеристики" },
    { id: "photos", label: "Фото" },
    { id: "seo", label: "SEO" },
  ];

  return (
    <div className="p-6">
      <div className="flex gap-1 mb-6 border-b">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === tab.id
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-600 hover:text-gray-900"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "main" && (
        <div className="grid gap-6 max-w-3xl">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Назва *</Label>
              <Input value={form.title} onChange={(e) => {
                set("title", e.target.value);
                if (mode === "create") set("uri", transliterate(e.target.value));
              }} />
            </div>
            <div className="space-y-1.5">
              <Label>Заголовок (H1)</Label>
              <Input value={form.main_title} onChange={(e) => set("main_title", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Артикул</Label>
              <Input value={form.pcode} onChange={(e) => set("pcode", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>URI (slug)</Label>
              <Input value={form.uri} onChange={(e) => set("uri", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label>Одиниця виміру</Label>
              <Select value={String(form.measure)} onValueChange={(v) => set("measure", v)}>
                <SelectTrigger><SelectValue placeholder="Оберіть..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">— Не вказано —</SelectItem>
                  {measures.map((m) => (
                    <SelectItem key={m.id} value={String(m.id)}>{m.title} ({m.short_title})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Мінімальна кількість</Label>
              <Input type="number" value={form.minquantity} onChange={(e) => set("minquantity", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Пріоритет</Label>
              <Input type="number" value={form.priority} onChange={(e) => set("priority", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label>Статус</Label>
              <Select value={String(form.active)} onValueChange={(v) => set("active", parseInt(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Активний</SelectItem>
                  <SelectItem value="0">Прихований</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Акційний</Label>
              <Select value={String(form.labelAction)} onValueChange={(v) => set("labelAction", parseInt(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">Ні</SelectItem>
                  <SelectItem value="1">Так</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Популярний</Label>
              <Select value={String(form.popular)} onValueChange={(v) => set("popular", parseInt(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">Ні</SelectItem>
                  <SelectItem value="1">Так</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Короткий опис</Label>
            <Textarea rows={3} value={form.descr} onChange={(e) => set("descr", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Повний опис</Label>
            <Textarea rows={6} value={form.text} onChange={(e) => set("text", e.target.value)} />
          </div>
        </div>
      )}

      {activeTab === "prices" && (
        <div className="grid gap-4 max-w-xl">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Ціна (грн) *</Label>
              <Input type="number" step="0.01" value={form.price} onChange={(e) => set("price", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Акційна ціна</Label>
              <Input type="number" step="0.01" value={form.price_sale} onChange={(e) => set("price_sale", e.target.value)} placeholder="Залишити порожнім" />
            </div>
          </div>
          <div className="border rounded-md p-4 space-y-3">
            <p className="text-sm font-medium text-gray-700">Оптові ціни</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Ціна 2</Label>
                <Input type="number" step="0.01" value={form.price2} onChange={(e) => set("price2", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Від (кількість)</Label>
                <Input type="number" value={form.price2n} onChange={(e) => set("price2n", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Ціна 3</Label>
                <Input type="number" step="0.01" value={form.price3} onChange={(e) => set("price3", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Від (кількість)</Label>
                <Input type="number" value={form.price3n} onChange={(e) => set("price3n", e.target.value)} />
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === "categories" && (
        <div className="max-w-xl space-y-3">
          <p className="text-sm text-gray-500">Оберіть одну або кілька категорій</p>
          <div className="border rounded-md divide-y max-h-80 overflow-y-auto">
            {categories.map((cat) => (
              <label key={cat.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedCategories.includes(cat.id)}
                  onChange={(e) => {
                    setSelectedCategories((prev) =>
                      e.target.checked ? [...prev, cat.id] : prev.filter((id) => id !== cat.id)
                    );
                  }}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <span className="text-sm">{cat.pid > 0 ? "  └ " : ""}{cat.title}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {activeTab === "filters" && (
        <div className="max-w-2xl space-y-4">
          {filters.map((filter) => (
            <div key={filter.id} className="border rounded-md overflow-hidden">
              <div className="bg-gray-50 px-4 py-2 font-medium text-sm">{filter.title}</div>
              <div className="p-3 flex flex-wrap gap-2">
                {filter.filters.map((ff) => (
                  <label key={ff.id} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedFilters.includes(ff.id)}
                      onChange={(e) => {
                        setSelectedFilters((prev) =>
                          e.target.checked ? [...prev, ff.id] : prev.filter((id) => id !== ff.id)
                        );
                      }}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    {ff.title}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === "chars" && (
        <div className="max-w-xl space-y-3">
          <div className="space-y-2">
            {chars.map((char, i) => (
              <div key={i} className="flex gap-2 items-center">
                <Input
                  placeholder="Характеристика"
                  value={char.title}
                  onChange={(e) => setChars((prev) => prev.map((c, j) => j === i ? { ...c, title: e.target.value } : c))}
                  className="w-48"
                />
                <Input
                  placeholder="Значення"
                  value={char.value}
                  onChange={(e) => setChars((prev) => prev.map((c, j) => j === i ? { ...c, value: e.target.value } : c))}
                />
                <button
                  onClick={() => setChars((prev) => prev.filter((_, j) => j !== i))}
                  className="text-red-400 hover:text-red-600 shrink-0"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={() => setChars((prev) => [...prev, { title: "", value: "" }])}>
            <Plus className="h-4 w-4 mr-1" />Додати характеристику
          </Button>
        </div>
      )}

      {activeTab === "photos" && product && (
        <PhotosTab productId={product.id} photos={product.photos ?? []} photos2={product.photos2 ?? []} />
      )}
      {activeTab === "photos" && !product && (
        <p className="text-sm text-gray-500">Спочатку збережіть товар, потім завантажте фото.</p>
      )}

      {activeTab === "seo" && (
        <div className="grid gap-4 max-w-2xl">
          <div className="space-y-1.5">
            <Label>SEO заголовок</Label>
            <Input value={form.seoTitle} onChange={(e) => set("seoTitle", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>SEO ключові слова</Label>
            <Textarea rows={2} value={form.seoKey} onChange={(e) => set("seoKey", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>SEO опис</Label>
            <Textarea rows={3} value={form.seoDescr} onChange={(e) => set("seoDescr", e.target.value)} />
          </div>
        </div>
      )}

      <div className="mt-8 flex gap-3">
        <Button onClick={save} disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {mode === "create" ? "Створити товар" : "Зберегти зміни"}
        </Button>
        <Button variant="outline" onClick={() => router.push("/products")}>Скасувати</Button>
      </div>
    </div>
  );
}

function PhotosTab({ productId, photos, photos2 }: {
  productId: number;
  photos: ProductPhoto[];
  photos2: ProductPhoto2[];
}) {
  const [uploading, setUploading] = useState(false);

  async function upload(files: FileList | null, gallery: boolean) {
    if (!files?.length) return;
    setUploading(true);
    const fd = new FormData();
    Array.from(files).forEach((f) => fd.append("files", f));
    fd.append("gallery", gallery ? "2" : "1");
    await fetch(`/api/products/${productId}/photos`, { method: "POST", body: fd });
    setUploading(false);
    window.location.reload();
  }

  async function deletePhoto(photoId: number, gallery: boolean) {
    if (!confirm("Видалити фото?")) return;
    await fetch(`/api/products/${productId}/photos`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ photoId, gallery }),
    });
    window.location.reload();
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <Card>
        <CardHeader><CardTitle className="text-sm">Основні фото</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3 mb-4">
            {photos.map((p) => (
              <div key={p.id} className="relative group">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/img/upload-files/products/${p.img}`}
                  alt=""
                  className="h-24 w-24 rounded-md object-cover border"
                />
                <button
                  onClick={() => deletePhoto(p.id, false)}
                  className="absolute -top-1.5 -right-1.5 hidden group-hover:flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
          <label className="cursor-pointer">
            <input type="file" multiple accept="image/*" className="hidden" onChange={(e) => upload(e.target.files, false)} />
            <Button variant="outline" size="sm" disabled={uploading} asChild>
              <span>{uploading ? "Завантаження..." : "Завантажити фото"}</span>
            </Button>
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm">Галерея (додаткові фото)</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3 mb-4">
            {photos2.map((p) => (
              <div key={p.id} className="relative group">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/img/upload-files/products2/${p.img}`}
                  alt=""
                  className="h-24 w-24 rounded-md object-cover border"
                />
                <button
                  onClick={() => deletePhoto(p.id, true)}
                  className="absolute -top-1.5 -right-1.5 hidden group-hover:flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
          <label className="cursor-pointer">
            <input type="file" multiple accept="image/*" className="hidden" onChange={(e) => upload(e.target.files, true)} />
            <Button variant="outline" size="sm" disabled={uploading} asChild>
              <span>{uploading ? "Завантаження..." : "Завантажити до галереї"}</span>
            </Button>
          </label>
        </CardContent>
      </Card>
    </div>
  );
}
