"use client";
import { useEffect, useState } from "react";
import { Header } from "@/components/admin/header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { apiFetch } from "@/lib/api";

const SETTING_LABELS: Record<string, string> = {
  site_title: "Назва сайту",
  form_email: "Email для форм",
  np_api_key: "API ключ Nova Poshta",
  sale_discount: "Знижка на акції (%)",
  search_length: "Мін. довжина пошуку",
  search_results_number: "К-сть результатів пошуку",
  recaptcha0siteks: "reCAPTCHA Site Key",
  recaptcha0secrets: "reCAPTCHA Secret Key",
};

export default function SettingsPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [settings, setSettings] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiFetch<any[]>("/api/settings").then((data) => { if (data) setSettings(data); });
  }, []);

  const updateValue = (id: number, text: string) => {
    setSettings((prev) => prev.map((s) => s.id === id ? { ...s, text } : s));
  };

  async function save() {
    setSaving(true);
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings.map((s) => ({ value: s.value, text: s.text, lang: s.lang }))),
    });
    toast.success("Налаштування збережено!");
    setSaving(false);
  }

  const known = settings.filter((s) => SETTING_LABELS[s.value]);
  const other = settings.filter((s) => !SETTING_LABELS[s.value]);

  return (
    <>
      <Header title="Налаштування" />
      <div className="p-6 max-w-2xl space-y-6">
        <Card>
          <CardHeader><CardTitle className="text-sm">Основні налаштування</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {known.map((s) => (
              <div key={s.id} className="space-y-1.5">
                <Label>{SETTING_LABELS[s.value]}</Label>
                <Input value={s.text} onChange={(e) => updateValue(s.id, e.target.value)} />
              </div>
            ))}
          </CardContent>
        </Card>

        {other.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-sm">Інші налаштування</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {other.map((s) => (
                <div key={s.id} className="space-y-1.5">
                  <Label className="font-mono text-xs text-gray-500">{s.value}</Label>
                  <Input value={s.text} onChange={(e) => updateValue(s.id, e.target.value)} />
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <Button onClick={save} disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Зберегти налаштування
        </Button>
      </div>
    </>
  );
}
