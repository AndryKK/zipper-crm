"use client";
import { useState } from "react";
import { Header } from "@/components/admin/header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Upload, Download, Loader2, FileSpreadsheet } from "lucide-react";

export default function PricePage() {
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string[]>([]);
  const [file, setFile] = useState<File | null>(null);

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
      </div>
    </>
  );
}
