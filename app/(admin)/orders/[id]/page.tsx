"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { Header } from "@/components/admin/header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { formatDate } from "@/lib/utils";
import {
  ArrowLeft, Loader2, Zap, Check, CheckCircle2, XCircle,
  AlertTriangle, MinusCircle, FileText, Package, CreditCard,
  Truck, MapPin, Star,
} from "lucide-react";

const PIPELINE = [
  { status: "В роботі",    label: "Опрацювання",  sublabel: "Рахунок + Viber",     color: "#d97706" },
  { status: "Оплачено",    label: "Оплата",        sublabel: "Підтверджено",         color: "#2563eb" },
  { status: "Відправлено", label: "Відправлено",   sublabel: "ТТН відстеження",      color: "#7c3aed" },
  { status: "Отримано",    label: "Отримано",      sublabel: "Клієнт отримав",       color: "#0891b2" },
  { status: "Завершено",   label: "Завершено",     sublabel: "Авто через 14 днів",   color: "#059669" },
];

const ALL_STATUSES = [
  { label: "Новий",        color: "#6b7280" },
  { label: "В роботі",    color: "#d97706" },
  { label: "Оплачено",    color: "#2563eb" },
  { label: "Відправлено", color: "#7c3aed" },
  { label: "Отримано",    color: "#0891b2" },
  { label: "Завершено",   color: "#059669" },
  { label: "Скасовано",   color: "#dc2626" },
];

type StepStatus = "ok" | "error" | "skipped" | "warn";
type StepLog = { step: string; status: StepStatus; msg: string; data?: Record<string, unknown> };

const STEP_ICON: Record<StepStatus, React.ReactNode> = {
  ok:      <CheckCircle2  size={15} color="#059669" />,
  error:   <XCircle       size={15} color="#dc2626" />,
  warn:    <AlertTriangle size={15} color="#d97706" />,
  skipped: <MinusCircle   size={15} color="#9ca3af" />,
};

const STEP_BG: Record<StepStatus, string> = {
  ok:      "rgba(16,185,129,0.10)",
  error:   "rgba(239,68,68,0.10)",
  warn:    "rgba(245,158,11,0.10)",
  skipped: "rgba(148,163,184,0.07)",
};

export default function OrderDetailPage() {
  const params  = useParams<{ id: string }>();
  const router  = useRouter();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [order,       setOrder]       = useState<any>(null);
  const [saving,      setSaving]      = useState(false);
  const [processing,  setProcessing]  = useState(false);
  const [confirming,  setConfirming]  = useState(false);
  const [status,      setStatus]      = useState("");
  const [notes,       setNotes]       = useState("");
  const [ttn,         setTtn]         = useState("");
  const [processLog,  setProcessLog]  = useState<StepLog[] | null>(null);
  const [confirmLog,  setConfirmLog]  = useState<StepLog[] | null>(null);
  const [ttnInputVal, setTtnInputVal] = useState("");
  const [ttnError,    setTtnError]    = useState("");

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    apiFetch<any>(`/api/orders/${params.id}`).then((data) => {
      if (!data) return;
      setOrder(data);
      setStatus(data.status ?? "");
      setNotes(data.notes ?? "");
      setTtn(data.ttn ?? "");
    });
  }, [params.id]);

  async function refreshOrder() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updated = await apiFetch<any>(`/api/orders/${params.id}`);
    if (updated) { setOrder(updated); setStatus(updated.status ?? ""); }
  }

  async function save() {
    setSaving(true);
    await fetch(`/api/orders/${params.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, notes, ttn: ttn.trim() || null }),
    });
    toast.success("Збережено!");
    setSaving(false);
    await refreshOrder();
  }

  async function autoProcess() {
    setProcessing(true);
    setProcessLog(null);
    setStatus("В роботі");
    try {
      const res  = await fetch(`/api/orders/${params.id}/process`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "Помилка"); return; }
      setProcessLog(data.log);
      await refreshOrder();
      const hasError = data.log.some((l: StepLog) => l.status === "error");
      if (hasError) toast.warning("Опрацьовано з помилками");
      else          toast.success("Замовлення опрацьовано!");
    } catch { toast.error("Помилка з'єднання"); }
    finally  { setProcessing(false); }
  }

  async function confirmPayment() {
    setConfirming(true);
    setConfirmLog(null);
    try {
      const res  = await fetch(`/api/orders/${params.id}/confirm-payment`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "Помилка"); return; }
      setConfirmLog(data.log);
      await refreshOrder();
      const hasError = data.log.some((l: StepLog) => l.status === "error");
      if (hasError) toast.warning("Підтверджено з помилками");
      else          toast.success("Оплату підтверджено!");
    } catch { toast.error("Помилка з'єднання"); }
    finally  { setConfirming(false); }
  }

  function validateTtn(value: string): string {
    const digits = value.replace(/\s/g, "");
    if (!digits) return "Введіть номер ТТН";
    if (!/^\d+$/.test(digits)) return "ТТН має містити лише цифри";
    if (digits.length !== 14) return `ТТН має бути 14 цифр (введено ${digits.length})`;
    return "";
  }

  async function markShipped() {
    const err = validateTtn(ttnInputVal);
    if (err) { setTtnError(err); return; }
    const digits = ttnInputVal.replace(/\s/g, "");
    setTtn(digits);
    await fetch(`/api/orders/${params.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "Відправлено", notes, ttn: digits }),
    });
    setStatus("Відправлено");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setOrder((prev: any) => ({ ...prev, status: "Відправлено", ttn: digits }));
    setTtnInputVal("");
    setTtnError("");
    toast.success("Статус: «Відправлено»");
  }

  async function advanceStatus(newStatus: string) {
    await fetch(`/api/orders/${params.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus, notes, ttn: ttn.trim() || null }),
    });
    setStatus(newStatus);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setOrder((prev: any) => ({ ...prev, status: newStatus }));
    toast.success(`Статус: «${newStatus}»`);
  }

  if (!order) return (
    <div className="p-6 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></div>
  );

  const step        = PIPELINE.findIndex((p) => p.status === status);
  const isCancelled = status === "Скасовано";
  const orderTotal  = order.items?.reduce(
    (s: number, i: { price: number; quantity: number }) => s + i.price * i.quantity, 0
  ) ?? 0;
  const currentPipe = PIPELINE[Math.max(0, step)];

  return (
    <>
      <Header title={`Замовлення #${order.id}`} />
      <div className="p-6 space-y-5 max-w-5xl">

        <button
          onClick={() => router.push("/orders")}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4" />Назад до замовлень
        </button>

        {/* ── PIPELINE BAR ──────────────────────────────────────────────── */}
        {isCancelled ? (
          <Card style={{ borderColor: "#dc262640" }}>
            <CardContent style={{ padding: "16px 20px", display: "flex", alignItems: "center", gap: 10 }}>
              <XCircle size={20} color="#dc2626" />
              <span style={{ fontWeight: 600, color: "#dc2626" }}>Замовлення скасовано</span>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent style={{ padding: "24px 20px 20px" }}>
              <div style={{ display: "flex", alignItems: "flex-start" }}>
                {PIPELINE.flatMap((p, i) => {
                  const isDone   = step > i;
                  const isActive = step === i;
                  const isFuture = step < i;

                  const circle = (
                    <div key={p.status} style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 84 }}>
                      <div style={{
                        width: 44, height: 44, borderRadius: "50%",
                        background: isDone || isActive ? p.color : "transparent",
                        border: isFuture ? "2px dashed #cbd5e1" : `2px solid ${p.color}`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        color: isDone || isActive ? "#fff" : "#94a3b8",
                        fontWeight: 700, fontSize: 17,
                        boxShadow: isActive ? `0 0 0 5px ${p.color}28, 0 0 0 10px ${p.color}0f` : "none",
                        transition: "all 0.3s ease",
                      }}>
                        {isDone ? <Check size={21} strokeWidth={3} /> : <span>{i + 1}</span>}
                      </div>
                      <div style={{
                        marginTop: 9, textAlign: "center", lineHeight: 1.25,
                        fontSize: 12, fontWeight: isActive ? 700 : isDone ? 600 : 400,
                        color: isFuture ? "var(--text-muted)" : "var(--text)",
                      }}>{p.label}</div>
                      <div style={{
                        fontSize: 10, color: "var(--text-muted)", textAlign: "center",
                        maxWidth: 74, lineHeight: 1.3, marginTop: 2,
                      }}>{p.sublabel}</div>
                    </div>
                  );

                  const connector = i < PIPELINE.length - 1 ? (
                    <div key={`line-${i}`} style={{
                      flex: 1, height: 3, marginTop: 19, borderRadius: 2,
                      background: isDone
                        ? `linear-gradient(to right, ${p.color}, ${PIPELINE[i + 1].color})`
                        : "var(--border)",
                      transition: "background 0.5s ease",
                    }} />
                  ) : null;

                  return connector ? [circle, connector] : [circle];
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── ACTION PANEL ──────────────────────────────────────────────── */}
        {!isCancelled && (
          <Card style={{
            border: step >= 0
              ? `1.5px solid ${currentPipe.color}50`
              : "1.5px solid var(--border)",
          }}>
            <CardContent style={{ padding: "20px 24px" }}>

              {/* Новий / не розпочато */}
              {step === -1 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <p style={{ fontSize: 14, color: "var(--text-muted)", margin: 0 }}>
                    Натисніть «Опрацювати» — сформується рахунок та клієнту надійде повідомлення на Viber.
                  </p>
                  <div>
                    <Button
                      onClick={autoProcess} disabled={processing}
                      style={{ background: "linear-gradient(135deg,#f59e0b,#d97706)", border: "none", color: "#fff", gap: 8, height: 44, fontSize: 15 }}
                    >
                      {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap size={17} />}
                      Опрацювати замовлення
                    </Button>
                  </div>
                </div>
              )}

              {/* Step 0 — В роботі */}
              {step === 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 10, background: "rgba(245,158,11,0.1)" }}>
                    <Zap size={16} color="#d97706" />
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#d97706" }}>Замовлення в роботі — очікуємо оплату від клієнта</span>
                  </div>
                  {order.doc_field_1 && (
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <FileText size={14} color="var(--text-muted)" />
                      <span style={{ fontSize: 13 }}>Рахунок: <strong>{order.doc_field_1}</strong></span>
                      <button
                        onClick={() => window.open(`/api/orders/${params.id}/invoice`, "_blank")}
                        style={{ padding: "3px 12px", borderRadius: 6, fontSize: 12, fontWeight: 600, background: "rgba(99,102,241,0.12)", color: "#6366f1", border: "1px solid rgba(99,102,241,0.22)", cursor: "pointer" }}
                      >
                        Відкрити PDF
                      </button>
                    </div>
                  )}
                  <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                    <Button
                      onClick={confirmPayment} disabled={confirming}
                      style={{ background: "linear-gradient(135deg,#3b82f6,#2563eb)", border: "none", color: "#fff", gap: 8, height: 42, fontSize: 14 }}
                    >
                      {confirming ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard size={16} />}
                      Підтвердити оплату
                    </Button>
                    <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Автоматично створить ТТН та спише зі складу</span>
                  </div>
                </div>
              )}

              {/* Step 1 — Оплачено */}
              {step === 1 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 10, background: "rgba(37,99,235,0.1)" }}>
                    <CheckCircle2 size={16} color="#2563eb" />
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#2563eb" }}>Оплату підтверджено — готуємо до відправки</span>
                  </div>

                  {order.ttn ? (
                    /* TTN вже є — одразу кнопка */
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <Package size={14} color="var(--text-muted)" />
                      <span style={{ fontSize: 13 }}>ТТН: <strong className="font-mono">{order.ttn}</strong></span>
                    </div>
                  ) : (
                    /* TTN відсутній — показуємо поле вводу */
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <Label style={{ fontSize: 13 }}>Введіть номер ТТН перед відправкою</Label>
                      <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                        <div style={{ flex: 1 }}>
                          <Input
                            value={ttnInputVal}
                            onChange={(e) => { setTtnInputVal(e.target.value); setTtnError(""); }}
                            onKeyDown={(e) => e.key === "Enter" && markShipped()}
                            placeholder="59000000000000 (14 цифр)"
                            className="font-mono"
                            style={ttnError ? { borderColor: "#dc2626" } : {}}
                          />
                          {ttnError && (
                            <div style={{ marginTop: 4, fontSize: 12, color: "#dc2626", display: "flex", alignItems: "center", gap: 4 }}>
                              <XCircle size={12} /> {ttnError}
                            </div>
                          )}
                        </div>
                        <Button
                          onClick={markShipped}
                          style={{ background: "linear-gradient(135deg,#8b5cf6,#7c3aed)", border: "none", color: "#fff", gap: 8, height: 40, fontSize: 14, flexShrink: 0 }}
                        >
                          <Truck size={15} />
                          Відправити
                        </Button>
                      </div>
                    </div>
                  )}

                  {order.ttn && (
                    <div>
                      <Button
                        onClick={() => advanceStatus("Відправлено")}
                        style={{ background: "linear-gradient(135deg,#8b5cf6,#7c3aed)", border: "none", color: "#fff", gap: 8, height: 42, fontSize: 14 }}
                      >
                        <Truck size={16} />
                        Позначити відправленим
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {/* Step 2 — Відправлено */}
              {step === 2 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 10, background: "rgba(124,58,237,0.1)" }}>
                    <Truck size={16} color="#7c3aed" />
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#7c3aed" }}>Посилка у дорозі</span>
                  </div>
                  {order.ttn && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <Package size={14} color="var(--text-muted)" />
                      <span style={{ fontSize: 13 }}>ТТН: <strong className="font-mono">{order.ttn}</strong></span>
                      <a
                        href={`https://novaposhta.ua/tracking/${order.ttn}`}
                        target="_blank" rel="noreferrer"
                        style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 10px", borderRadius: 6, fontSize: 12, fontWeight: 600, background: "rgba(124,58,237,0.1)", color: "#7c3aed", border: "1px solid rgba(124,58,237,0.2)", textDecoration: "none" }}
                      >
                        <Truck size={11} /> Відстежити
                      </a>
                    </div>
                  )}
                  <div>
                    <Button
                      onClick={() => advanceStatus("Отримано")}
                      style={{ background: "linear-gradient(135deg,#06b6d4,#0891b2)", border: "none", color: "#fff", gap: 8, height: 42, fontSize: 14 }}
                    >
                      <MapPin size={16} />
                      Позначити отриманим
                    </Button>
                  </div>
                </div>
              )}

              {/* Step 3 — Отримано */}
              {step === 3 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 10, background: "rgba(8,145,178,0.1)" }}>
                    <CheckCircle2 size={16} color="#0891b2" />
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#0891b2" }}>Клієнт отримав замовлення</span>
                  </div>
                  <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>
                    Через 14 днів статус автоматично зміниться на «Завершено».
                  </p>
                  <div>
                    <Button
                      onClick={() => advanceStatus("Завершено")}
                      style={{ background: "linear-gradient(135deg,#10b981,#059669)", border: "none", color: "#fff", gap: 8, height: 42, fontSize: 14 }}
                    >
                      <Star size={16} />
                      Завершити зараз
                    </Button>
                  </div>
                </div>
              )}

              {/* Step 4 — Завершено */}
              {step === 4 && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 10, background: "rgba(5,150,105,0.1)" }}>
                  <Star size={16} color="#059669" />
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#059669" }}>Замовлення успішно завершено</span>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* ── PROCESS / CONFIRM LOG ─────────────────────────────────────── */}
        {(processLog || confirmLog) && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Zap size={14} color="#d97706" />
                Результат опрацювання
              </CardTitle>
            </CardHeader>
            <CardContent style={{ padding: "0 16px 16px" }}>
              <div className="space-y-2">
                {(processLog ?? confirmLog)!.map((entry, i) => (
                  <div key={i} style={{
                    display: "flex", alignItems: "flex-start", gap: 10,
                    padding: "8px 12px", borderRadius: 8,
                    background: STEP_BG[entry.status], fontSize: 13,
                  }}>
                    <span style={{ marginTop: 1, flexShrink: 0 }}>{STEP_ICON[entry.status]}</span>
                    <div>
                      <div style={{ fontWeight: 600, marginBottom: 1 }}>{entry.step}</div>
                      <div style={{ color: "var(--text-muted)", fontSize: 12 }}>{entry.msg}</div>
                    </div>
                  </div>
                ))}
              </div>
              {processLog && order.doc_field_1 && (
                <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end" }}>
                  <button
                    onClick={() => window.open(`/api/orders/${params.id}/invoice`, "_blank")}
                    style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 18px", borderRadius: 8, fontSize: 13, fontWeight: 600, background: "linear-gradient(135deg,#6366f1,#8b5cf6)", color: "#fff", border: "none", cursor: "pointer" }}
                  >
                    <FileText size={14} /> Завантажити рахунок
                  </button>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* ── GRID ──────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Client info */}
          <Card>
            <CardHeader><CardTitle className="text-sm">Клієнт</CardTitle></CardHeader>
            <CardContent className="space-y-1 text-sm">
              <div><span className="text-gray-500">Ім&apos;я:</span> {order.person ?? "—"}</div>
              <div><span className="text-gray-500">Телефон:</span> {order.phone ?? "—"}</div>
              <div><span className="text-gray-500">Логін:</span> {order.login ?? "—"}</div>
              <div><span className="text-gray-500">Адреса:</span> {order.addr_delivery ?? "—"}</div>
              {order.ttn && (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span className="text-gray-500">ТТН:</span>
                  <span className="font-mono font-semibold">{order.ttn}</span>
                  <a
                    href={`https://novaposhta.ua/tracking/${order.ttn}`}
                    target="_blank" rel="noreferrer"
                    style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 10px", borderRadius: 6, fontSize: 12, fontWeight: 600, background: "rgba(124,58,237,0.1)", color: "#7c3aed", border: "1px solid rgba(124,58,237,0.2)", textDecoration: "none" }}
                  >
                    <Truck size={11} /> Відстежити
                  </a>
                </div>
              )}
              {order.doc_field_1 && (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span className="text-gray-500">Рахунок:</span>
                  <span className="font-mono font-semibold">{order.doc_field_1}</span>
                  <button
                    onClick={() => window.open(`/api/orders/${params.id}/invoice`, "_blank")}
                    style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 10px", borderRadius: 6, fontSize: 12, fontWeight: 600, background: "rgba(99,102,241,0.1)", color: "#6366f1", border: "none", cursor: "pointer" }}
                  >
                    <FileText size={12} /> PDF
                  </button>
                </div>
              )}
              {order.pay_method && <div><span className="text-gray-500">Оплата:</span> {order.pay_method}</div>}
              <div><span className="text-gray-500">Дата:</span> {formatDate(order.date)}</div>
            </CardContent>
          </Card>

          {/* Manual control */}
          <Card>
            <CardHeader><CardTitle className="text-sm">Ручне управління</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label>Статус</Label>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{
                    width: 10, height: 10, borderRadius: "50%", flexShrink: 0,
                    background: ALL_STATUSES.find((s) => s.label === status)?.color ?? "#6b7280",
                  }} />
                  <Select value={status || "__empty__"} onValueChange={(v) => setStatus(v === "__empty__" ? "" : v)}>
                    <SelectTrigger style={{ flex: 1, fontWeight: 600 }}>
                      <SelectValue placeholder="Оберіть статус" />
                    </SelectTrigger>
                    <SelectContent>
                      {!ALL_STATUSES.find((s) => s.label === status) && status && (
                        <SelectItem value={status}>{status}</SelectItem>
                      )}
                      {ALL_STATUSES.map((s) => (
                        <SelectItem key={s.label} value={s.label}>
                          <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ width: 8, height: 8, borderRadius: "50%", background: s.color, flexShrink: 0 }} />
                            {s.label}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <Label>ТТН Нова Пошта</Label>
                  {ttn.trim() && (
                    <a
                      href={`https://novaposhta.ua/tracking/${ttn.trim()}`}
                      target="_blank" rel="noreferrer"
                      style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 600, color: "#7c3aed", textDecoration: "none" }}
                    >
                      <Truck size={11} /> Відстежити
                    </a>
                  )}
                </div>
                <Input
                  value={ttn}
                  onChange={(e) => setTtn(e.target.value)}
                  placeholder="напр. 59000000000000"
                  className="font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Нотатки</Label>
                <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
              <Button onClick={save} disabled={saving} className="w-full">
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Зберегти
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* ── ITEMS TABLE ───────────────────────────────────────────────── */}
        <Card>
          <CardHeader><CardTitle className="text-sm">Товари замовлення</CardTitle></CardHeader>
          <CardContent style={{ padding: 0 }}>
            <table className="crm-table">
              <thead>
                <tr>
                  <th>ID товару</th>
                  <th>Тип</th>
                  <th style={{ textAlign: "right" }}>Ціна</th>
                  <th style={{ textAlign: "right" }}>К-сть</th>
                  <th style={{ textAlign: "right" }}>Сума</th>
                </tr>
              </thead>
              <tbody>
                {order.items?.map((item: { id: number; product: number; type: string | null; price: number; quantity: number }) => (
                  <tr key={item.id}>
                    <td className="font-mono text-xs" style={{ color: "var(--text-muted)" }}>#{item.product}</td>
                    <td style={{ color: "var(--text-muted)" }}>{item.type ?? "—"}</td>
                    <td style={{ textAlign: "right" }}>{item.price.toFixed(2)} грн</td>
                    <td style={{ textAlign: "right" }}>{item.quantity}</td>
                    <td className="font-medium" style={{ textAlign: "right" }}>{(item.price * item.quantity).toFixed(2)} грн</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4} className="font-semibold" style={{ textAlign: "right", borderBottom: "none" }}>Разом:</td>
                  <td className="font-bold text-lg" style={{ textAlign: "right", borderBottom: "none" }}>{orderTotal.toFixed(2)} грн</td>
                </tr>
              </tfoot>
            </table>
          </CardContent>
        </Card>

        {order.returns?.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-sm text-red-600">Повернення</CardTitle></CardHeader>
            <CardContent>
              {order.returns.map((ret: { id: number; reason: string | null; date: string; status: string | null }) => (
                <div key={ret.id} className="border-b last:border-0 py-2 text-sm">
                  <span className="text-gray-500">#{ret.id}</span> — {ret.reason ?? "Без причини"} ({formatDate(ret.date)})
                  {ret.status && <span className="ml-2 text-gray-400">[{ret.status}]</span>}
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
