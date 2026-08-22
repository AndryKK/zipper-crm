"use client";
import { useEffect, useState } from "react";
import { Header } from "@/components/admin/header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Plus, Trash2, Loader2, GripVertical } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { getImgUrl } from "@/lib/utils";

export default function SliderPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [slides, setSlides] = useState<any[]>([]);
  const [adding, setAdding] = useState(false);
  const [newSlide, setNewSlide] = useState({ title: "", descr: "", uri: "", priority: 0 });
  const [imgFile, setImgFile] = useState<File | null>(null);
  const [img2File, setImg2File] = useState<File | null>(null);

  useEffect(() => {
    apiFetch<any[]>("/api/slider").then((data) => { if (data) setSlides(data); });
  }, []);

  async function addSlide() {
    setAdding(true);
    const fd = new FormData();
    Object.entries(newSlide).forEach(([k, v]) => fd.append(k, String(v)));
    if (imgFile) fd.append("img", imgFile);
    if (img2File) fd.append("img2", img2File);
    const res = await fetch("/api/slider", { method: "POST", body: fd });
    const created = await res.json();
    setSlides((prev) => [...prev, created]);
    setNewSlide({ title: "", descr: "", uri: "", priority: slides.length });
    setImgFile(null);
    setImg2File(null);
    toast.success("Слайд додано!");
    setAdding(false);
  }

  async function updateSlide(id: number, data: object) {
    await fetch(`/api/slider/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    toast.success("Збережено!");
  }

  async function deleteSlide(id: number) {
    if (!confirm("Видалити слайд?")) return;
    await fetch(`/api/slider/${id}`, { method: "DELETE" });
    setSlides((prev) => prev.filter((s) => s.id !== id));
    toast.success("Видалено!");
  }

  return (
    <>
      <Header title="Слайдер" />
      <div className="p-4 md:p-6 space-y-6 max-w-4xl">
        <Card>
          <CardHeader><CardTitle className="text-sm">Новий слайд</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Заголовок</Label>
                <Input value={newSlide.title} onChange={(e) => setNewSlide((p) => ({ ...p, title: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Посилання (URI)</Label>
                <Input value={newSlide.uri} onChange={(e) => setNewSlide((p) => ({ ...p, uri: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Опис</Label>
              <Textarea rows={2} value={newSlide.descr} onChange={(e) => setNewSlide((p) => ({ ...p, descr: e.target.value }))} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Зображення (десктоп)</Label>
                <Input type="file" accept="image/*" onChange={(e) => setImgFile(e.target.files?.[0] ?? null)} />
              </div>
              <div className="space-y-1.5">
                <Label>Зображення (мобайл)</Label>
                <Input type="file" accept="image/*" onChange={(e) => setImg2File(e.target.files?.[0] ?? null)} />
              </div>
            </div>
            <Button onClick={addSlide} disabled={adding} className="w-full sm:w-auto">
              {adding ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-1.5" />}
              Додати слайд
            </Button>
          </CardContent>
        </Card>

        <div className="space-y-3">
          {slides.map((slide) => (
            <Card key={slide.id} className="overflow-hidden">
              {/* flex-col below sm: grip+image on their own row (identity),
                  then the text fields, then priority+delete — the original
                  single flex-row (grip + 128px image + flex-1 fields +
                  fixed priority/delete column, all with gap-4 between)
                  never had room on a phone. `sm:contents` unwraps the
                  grip+image pairing back into direct row children at sm+,
                  restoring the exact original desktop spacing/layout. */}
              <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 p-4">
                <div className="flex items-center gap-3 sm:contents">
                  <div className="shrink-0 flex items-center text-gray-300">
                    <GripVertical className="h-5 w-5" />
                  </div>
                  {slide.img && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={getImgUrl(slide.img, "slider")} alt="" className="h-16 w-24 sm:h-20 sm:w-32 rounded object-cover shrink-0" />
                  )}
                </div>
                <div className="flex-1 space-y-2 min-w-0">
                  <Input defaultValue={slide.title} onBlur={(e) => updateSlide(slide.id, { title: e.target.value })} placeholder="Заголовок" />
                  <Input defaultValue={slide.uri ?? ""} onBlur={(e) => updateSlide(slide.id, { uri: e.target.value })} placeholder="Посилання" />
                  <Input defaultValue={slide.descr ?? ""} onBlur={(e) => updateSlide(slide.id, { descr: e.target.value })} placeholder="Опис" />
                </div>
                <div className="flex items-center gap-3 sm:flex-col sm:gap-2 sm:items-stretch shrink-0">
                  <Input type="number" defaultValue={slide.priority} onBlur={(e) => updateSlide(slide.id, { priority: parseInt(e.target.value) })} className="w-20" placeholder="Порядок" />
                  <button onClick={() => deleteSlide(slide.id)} className="text-red-400 hover:text-red-600 flex items-center gap-1 text-sm">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </Card>
          ))}
          {slides.length === 0 && <p className="text-center text-gray-400 py-8">Слайдів немає</p>}
        </div>
      </div>
    </>
  );
}
