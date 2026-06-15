"use client";
import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { transliterate } from "@/lib/utils";
import { Loader2, Upload } from "lucide-react";
import type { Category } from "@/app/generated/prisma";

interface Props {
  category?: Category | null;
  parentCategories: Category[];
}

export function CategoryForm({ category, parentCategories }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [imgUploading, setImgUploading] = useState(false);
  const [currentImg, setCurrentImg] = useState(category?.img ?? "");
  const imgInputRef = useRef<HTMLInputElement>(null);
  const isNew = !category;

  const [form, setForm] = useState({
    title: category?.title ?? "",
    uri: category?.uri ?? "",
    pid: category?.pid ?? 0,
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
                <SelectItem key={p.id} value={String(p.translationId)}>{p.title}</SelectItem>
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
              <img src={`/img/upload-files/categories/${currentImg}`} alt="" className="h-20 w-20 rounded object-cover border" />
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
    </div>
  );
}
