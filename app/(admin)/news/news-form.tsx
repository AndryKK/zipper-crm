"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Loader2, Trash2 } from "lucide-react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function NewsForm({ news }: { news?: any }) {
  const router = useRouter();
  const isEdit = !!news?.id;
  const [form, setForm] = useState({
    title: news?.title ?? "",
    uri: news?.uri ?? "",
    descr: news?.descr ?? "",
    text: news?.text ?? "",
    img: news?.img ?? "",
    priority: news?.priority ?? 0,
    data: news?.data ? new Date(news.data).toISOString().split("T")[0] : new Date().toISOString().split("T")[0],
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  function set(field: string, value: unknown) { setForm((p) => ({ ...p, [field]: value })); }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const url = isEdit ? `/api/news/${news.id}` : "/api/news";
    const method = isEdit ? "PUT" : "POST";
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    if (res.ok) {
      toast.success(isEdit ? "Збережено!" : "Новину додано!");
      router.push("/news");
      router.refresh();
    } else {
      toast.error("Помилка збереження");
    }
    setSaving(false);
  }

  async function remove() {
    if (!confirm("Видалити новину?")) return;
    setDeleting(true);
    await fetch(`/api/news/${news.id}`, { method: "DELETE" });
    toast.success("Видалено!");
    router.push("/news");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="p-6 max-w-2xl space-y-4">
      <div className="space-y-1">
        <Label>Заголовок *</Label>
        <Input value={form.title} onChange={(e) => set("title", e.target.value)} required />
      </div>
      <div className="space-y-1">
        <Label>URI (URL)</Label>
        <Input value={form.uri} onChange={(e) => set("uri", e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label>Зображення (URL або шлях)</Label>
        <Input value={form.img} onChange={(e) => set("img", e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label>Короткий опис</Label>
        <Textarea value={form.descr} onChange={(e) => set("descr", e.target.value)} rows={3} />
      </div>
      <div className="space-y-1">
        <Label>Текст</Label>
        <Textarea value={form.text} onChange={(e) => set("text", e.target.value)} rows={10} />
      </div>
      <div className="flex gap-4">
        <div className="space-y-1">
          <Label>Приоритет</Label>
          <Input type="number" value={form.priority} onChange={(e) => set("priority", parseInt(e.target.value))} className="w-24" />
        </div>
        <div className="space-y-1">
          <Label>Дата</Label>
          <Input type="date" value={form.data} onChange={(e) => set("data", e.target.value)} />
        </div>
      </div>
      <div className="flex items-center gap-3 pt-2">
        <Button type="submit" disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {isEdit ? "Зберегти" : "Додати"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>Скасувати</Button>
        {isEdit && (
          <Button type="button" variant="destructive" onClick={remove} disabled={deleting} className="ml-auto">
            {deleting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            <Trash2 className="h-4 w-4 mr-2" />Видалити
          </Button>
        )}
      </div>
    </form>
  );
}
