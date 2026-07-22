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

type Section = {
  title: string;
  keys: string[];
  description?: string;
};

const LABELS: Record<string, string> = {
  // Загальні
  site_title:            "Назва сайту",
  form_email:            "Email для форм",
  sale_discount:         "Знижка на акції (%)",
  search_length:         "Мін. довжина пошуку",
  search_results_number: "К-сть результатів пошуку",
  recaptcha0siteks:      "reCAPTCHA Site Key",
  recaptcha0secrets:     "reCAPTCHA Secret Key",
  // Реквізити постачальника
  supplier_name:         "Назва / ПІБ",
  supplier_account:      "Р/р (IBAN)",
  supplier_bank:         "Банк",
  supplier_edrpou:       "ЄДРПОУ / ІПН",
  supplier2_name:        "Назва / ПІБ",
  supplier2_account:     "Р/р (IBAN)",
  supplier2_bank:        "Банк",
  supplier2_edrpou:      "ЄДРПОУ / ІПН",
  supplier_threshold:    "Поріг суми замовлення (грн)",
  // Nova Poshta
  np_api_key:            "API ключ",
  np_sender_ref:         "Ref відправника (Counterparty)",
  np_sender_contact_ref: "Ref контакту відправника",
  np_sender_city_ref:    "Ref міста відправника",
  np_sender_warehouse_ref: "Ref відділення відправника",
  np_sender_phone:       "Телефон відправника",
  np_demo_mode:          "Демо-режим",
  // Viber
  viber_token:           "Bot Token",
};

const SECTIONS: Section[] = [
  { title: "Загальні", keys: ["site_title", "form_email", "sale_discount", "search_length", "search_results_number", "recaptcha0siteks", "recaptcha0secrets"] },
  { title: "Постачальник 1 (сума в межах порогу)", keys: ["supplier_name", "supplier_account", "supplier_bank", "supplier_edrpou"] },
  { title: "Постачальник 2 (сума перевищує поріг)", keys: ["supplier2_name", "supplier2_account", "supplier2_bank", "supplier2_edrpou"] },
  {
    title: "Поріг автоматичного вибору постачальника",
    keys: ["supplier_threshold"],
    description: "Якщо сума замовлення перевищує це значення, у рахунку-фактурі та видатковій накладній автоматично використовуються реквізити Постачальника 2. За замовчуванням — 3000 грн.",
  },
  {
    title: "Nova Poshta",
    keys: ["np_demo_mode", "np_api_key", "np_sender_ref", "np_sender_contact_ref", "np_sender_city_ref", "np_sender_warehouse_ref", "np_sender_phone"],
    description: "У демо-режимі при оплаті замовлення генерується випадковий 14-значний номер ТТН замість реального звернення до API Нової Пошти — зручно для перевірки решти функцій без справжньої відправки.",
  },
  { title: "Viber", keys: ["viber_token"] },
];

const ALL_KNOWN_KEYS = new Set(SECTIONS.flatMap((s) => s.keys));

export default function SettingsPage() {
  // values map: key → text
  const [values, setValues] = useState<Record<string, string>>({});
  // "other" = DB records not in LABELS
  const [other, setOther] = useState<{ id: number; value: string; text: string; lang: string }[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiFetch<{ id: number; value: string; text: string; lang: string }[]>("/api/settings").then((data) => {
      if (!data) return;
      const map: Record<string, string> = {};
      for (const s of data) map[s.value] = s.text;
      setValues(map);
      setOther(data.filter((s) => !ALL_KNOWN_KEYS.has(s.value)));
    });
  }, []);

  function set(key: string, text: string) {
    setValues((prev) => ({ ...prev, [key]: text }));
  }

  function setOtherValue(key: string, text: string) {
    setOther((prev) => prev.map((s) => s.value === key ? { ...s, text } : s));
  }

  async function save() {
    setSaving(true);
    const knownEntries = SECTIONS.flatMap((sec) =>
      sec.keys.map((k) => ({ value: k, text: values[k] ?? "", lang: "uk" }))
    );
    const otherEntries = other.map((s) => ({ value: s.value, text: s.text, lang: s.lang }));

    const res = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([...knownEntries, ...otherEntries]),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(`Помилка збереження: ${data.error ?? "невідома помилка"}`);
    } else {
      toast.success("Налаштування збережено!");
    }
    setSaving(false);
  }

  return (
    <>
      <Header title="Налаштування" />
      <div className="p-6 max-w-2xl space-y-6">
        {SECTIONS.map((sec) => (
          <Card key={sec.title}>
            <CardHeader>
              <CardTitle className="text-sm">{sec.title}</CardTitle>
              {sec.description && (
                <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 4 }}>{sec.description}</p>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              {sec.keys.map((k) =>
                k === "np_demo_mode" ? (
                  <label
                    key={k}
                    style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}
                  >
                    <input
                      type="checkbox"
                      checked={values[k] === "1"}
                      onChange={(e) => set(k, e.target.checked ? "1" : "0")}
                      style={{ width: 16, height: 16, cursor: "pointer" }}
                    />
                    <span style={{ fontSize: 13.5 }}>{LABELS[k]} — генерувати випадковий ТТН замість реального</span>
                  </label>
                ) : (
                  <div key={k} className="space-y-1.5">
                    <Label>{LABELS[k]}</Label>
                    <Input
                      value={values[k] ?? ""}
                      onChange={(e) => set(k, e.target.value)}
                      placeholder={k === "supplier_threshold" ? "3000" : k}
                      type={k === "supplier_threshold" ? "number" : k.includes("secret") || k.includes("token") || k.includes("key") ? "password" : "text"}
                    />
                  </div>
                )
              )}
            </CardContent>
          </Card>
        ))}

        {other.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-sm">Інші налаштування</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {other.map((s) => (
                <div key={s.value} className="space-y-1.5">
                  <Label className="font-mono text-xs text-gray-500">{s.value}</Label>
                  <Input value={s.text} onChange={(e) => setOtherValue(s.value, e.target.value)} />
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
