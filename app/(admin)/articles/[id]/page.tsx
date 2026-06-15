"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Header } from "@/components/admin/header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { transliterate } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import { apiFetch } from "@/lib/api";

export default function EditArticlePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const isNew = params.id === "new";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [form, setForm] = useState<any>({ title: "", uri: "", descr: "", text: "", seoTitle: "", seoKey: "", seoDescr: "", lang: "uk", priority: 0 });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isNew) {
      apiFetch<any>(`/api/articles/${params.id}`).then((data) => { if (data) setForm(data); });
    }
  }, [isNew, params.id]);

  const set = (k: string, v: unknown) => setForm((p: typeof form) => ({ ...p, [k]: v }));

  async function save() {
    setSaving(true);
    if (isNew) {
      const res = await fetch("/api/articles", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const created = await res.json();
      toast.success("Статтю створено!");
      router.push(`/articles/${created.id}`);
    } else {
      await fetch(`/api/articles/${params.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      toast.success("Збережено!");
      router.refresh();
    }
    setSaving(false);
  }

  return (
    <>
      <Header title={isNew ? "Нова стаття" : form.title} />
      <div className="p-6 max-w-3xl space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Назва *</Label>
            <Input value={form.title} onChange={(e) => { set("title", e.target.value); if (isNew) set("uri", transliterate(e.target.value)); }} />
          </div>
          <div className="space-y-1.5">
            <Label>URI</Label>
            <Input value={form.uri} onChange={(e) => set("uri", e.target.value)} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Короткий опис</Label>
          <Textarea rows={3} value={form.descr ?? ""} onChange={(e) => set("descr", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Текст статті</Label>
          <Textarea rows={10} value={form.text ?? ""} onChange={(e) => set("text", e.target.value)} />
        </div>
        <div className="border-t pt-4 space-y-3">
          <p className="text-sm font-medium">SEO</p>
          <Input placeholder="SEO заголовок" value={form.seoTitle ?? ""} onChange={(e) => set("seoTitle", e.target.value)} />
          <Textarea placeholder="SEO опис" rows={2} value={form.seoDescr ?? ""} onChange={(e) => set("seoDescr", e.target.value)} />
        </div>
        <div className="flex gap-3">
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {isNew ? "Створити" : "Зберегти"}
          </Button>
          <Button variant="outline" onClick={() => router.push("/articles")}>Скасувати</Button>
        </div>
      </div>
    </>
  );
}
