"use client";
import { useState, useEffect, useCallback } from "react";
import { Header } from "@/components/admin/header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Upload, Download, Loader2, FileSpreadsheet, RefreshCw, ExternalLink } from "lucide-react";

type PriceListDoc = {
  id: number;
  title: string;
  file: string;
  lang: string;
  translation_id: number;
  date: string | null;
};

export default function PricePage() {
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string[]>([]);
  const [file, setFile] = useState<File | null>(null);

  const [priceListDocs, setPriceListDocs] = useState<PriceListDoc[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [regenerating, setRegenerating] = useState(false);

  const loadPriceListDocs = useCallback(async () => {
    setLoadingDocs(true);
    const res = await fetch("/api/price-lists");
    const data = await res.json();
    setPriceListDocs(data.docs ?? []);
    setLoadingDocs(false);
  }, []);

  useEffect(() => {
    loadPriceListDocs();
  }, [loadPriceListDocs]);

  async function regeneratePriceLists() {
    setRegenerating(true);
    const res = await fetch("/api/price-lists", { method: "POST" });
    const data = await res.json();
    if (res.ok) {
      const total = (data.log ?? []).reduce((sum: number, l: any) => sum + (l.products ?? 0), 0);
      toast.success(`Прайс-листи оновлено: ${total} товарів у ${(data.log ?? []).filter((l: any) => !l.skipped).length} файлах`);
      loadPriceListDocs();
    } else {
      toast.error(data.error ?? "Помилка генерації");
    }
    setRegenerating(false);
  }

  async function importPrice() {
    if (!file) return;
    setImporting(true);
    setImportResult([]);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/price/import", { method: "POST", body: fd });
    const data = await res.json();
    if (res.ok) {
      setImportResult(data.log ?? []);
      toast.success(`Імпорт завершено: ${data.updated ?? 0} товарів оновлено`);
    } else {
      toast.error(data.error ?? "Помилка імпорту");
    }
    setImporting(false);
  }

  async function exportPrice() {
    const res = await fetch("/api/price/export");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `price_${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    toast.success("Прайс завантажено!");
  }

  return (
    <>
      <Header title="Прайс — Імпорт / Експорт" />
      <div className="p-6 max-w-2xl space-y-6">
        <Card>
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Upload className="h-4 w-4" />Імпорт прайсу (XLS/XLSX)</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="border-2 border-dashed rounded-lg p-6 text-center">
              <FileSpreadsheet className="h-10 w-10 mx-auto text-gray-300 mb-2" />
              <p className="text-sm text-gray-500 mb-3">Формат: артикул, назва, ціна, ціна акц., ціна2, мін.кількість2, ціна3, мін.кількість3</p>
              <input type="file" accept=".xls,.xlsx,.csv" className="hidden" id="price-file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              <label htmlFor="price-file" className="cursor-pointer">
                <Button variant="outline" asChild>
                  <span>{file ? file.name : "Обрати файл..."}</span>
                </Button>
              </label>
            </div>
            <Button onClick={importPrice} disabled={!file || importing} className="w-full">
              {importing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
              Запустити імпорт
            </Button>
            {importResult.length > 0 && (
              <div className="bg-gray-50 rounded-md p-3 max-h-48 overflow-y-auto">
                {importResult.map((line, i) => <p key={i} className="text-xs font-mono">{line}</p>)}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Download className="h-4 w-4" />Експорт прайсу</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm text-gray-500 mb-4">Завантажити поточний каталог у форматі XLSX.</p>
            <Button onClick={exportPrice} variant="outline" className="w-full">
              <Download className="h-4 w-4 mr-2" />Завантажити прайс XLSX
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><FileSpreadsheet className="h-4 w-4" />Публічні прайс-листи по категоріях</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-gray-500">
              Файли, які клієнти завантажують на сторінці «Прайс» обох сайтів (по категорії, по мові).
              Оновіть після зміни цін чи асортименту — стара версія лишається доступною, поки не згенерується нова.
            </p>
            <Button onClick={regeneratePriceLists} disabled={regenerating} className="w-full">
              {regenerating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Оновити прайс-листи зараз
            </Button>
            {loadingDocs ? (
              <p className="text-sm text-gray-400">Завантаження…</p>
            ) : priceListDocs.length === 0 ? (
              <p className="text-sm text-gray-400">Ще не згенеровано жодного файлу.</p>
            ) : (
              <div className="border rounded-md divide-y">
                {priceListDocs.map((d) => (
                  <a
                    key={d.id}
                    href={d.file}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between px-3 py-2 text-sm hover:bg-gray-50"
                  >
                    <span>
                      {d.title}
                      <span className="text-gray-400 ml-2">[{d.lang}]</span>
                    </span>
                    <span className="flex items-center gap-2 text-gray-400 text-xs">
                      {d.date ? new Date(d.date).toLocaleString("uk-UA") : ""}
                      <ExternalLink className="h-3.5 w-3.5" />
                    </span>
                  </a>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
