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
export function ServiceForm({ service }: { service?: any }) {
  const router = useRouter();
  const isEdit = !!service?.id;
  const [form, setForm] = useState({
    title: service?.title ?? "",
    descr: service?.descr ?? "",
    img: service?.img ?? "",
    priority: service?.priority ?? 0,
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  function set(field: string, value: unknown) { setForm((p) => ({ ...p, [field]: value })); }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const url = isEdit ? `/api/services/${service.id}` : "/api/services";
    const method = isEdit ? "PUT" : "POST";
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    if (res.ok) {
      toast.success(isEdit ? "Збережено!" : "Послугу додано!");
      router.push("/services");
      router.refresh();
    } else {
      toast.error("Помилка збереження");
    }
    setSaving(false);
  }

  async function remove() {
    if (!confirm("Видалити послугу?")) return;
    setDeleting(true);
    await fetch(`/api/services/${service.id}`, { method: "DELETE" });
    toast.success("Видалено!");
    router.push("/services");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="p-6 max-w-2xl space-y-4">
      <div className="space-y-1">
        <Label>Назва *</Label>
        <Input value={form.title} onChange={(e) => set("title", e.target.value)} required />
      </div>
      <div className="space-y-1">
        <Label>Зображення (URL або шлях)</Label>
        <Input value={form.img} onChange={(e) => set("img", e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label>Опис</Label>
        <Textarea value={form.descr} onChange={(e) => set("descr", e.target.value)} rows={6} />
      </div>
      <div className="space-y-1">
        <Label>Приоритет</Label>
        <Input type="number" value={form.priority} onChange={(e) => set("priority", parseInt(e.target.value))} className="w-24" />
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
