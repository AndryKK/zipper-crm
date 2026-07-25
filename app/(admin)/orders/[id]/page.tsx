"use client";
import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { parseNpAddress } from "@/lib/nova-poshta";
import { Header } from "@/components/admin/header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { formatDate } from "@/lib/utils";
import { RETURN_STATUS, RETURN_STATUS_COLOR } from "@/lib/returns";
import {
  ArrowLeft, Loader2, Zap, Check, CheckCircle2, XCircle,
  AlertTriangle, MinusCircle, FileText, Package, CreditCard,
  Truck, MapPin, Star, Pencil, Trash2, Plus, X, Search, ClipboardList,
  Mail, Banknote, PackageSearch, SlidersHorizontal,
} from "lucide-react";

// "Отримано" used to be its own pipeline step with a separate manual/14-day
// wait before "Завершено" — collapsed into one: once the client has the
// parcel, the order is done, nothing further to wait on.
const PIPELINE = [
  { status: "В роботі",    label: "Опрацювання",  sublabel: "Рахунок + Viber",     color: "#d97706" },
  { status: "Оплачено",    label: "Оплата",        sublabel: "Підтверджено",         color: "#2563eb" },
  { status: "Відправлено", label: "Відправлено",   sublabel: "ТТН відстеження",      color: "#7c3aed" },
  { status: "Завершено",   label: "Завершено",     sublabel: "Клієнт отримав",       color: "#059669" },
];

const ALL_STATUSES = [
  { label: "Новий",        color: "#6b7280" },
  { label: "В роботі",    color: "#d97706" },
  { label: "Оплачено",    color: "#2563eb" },
  { label: "Відправлено", color: "#7c3aed" },
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
  const [checkingNp,  setCheckingNp]  = useState(false);

  // Cancel TTN — only ever offered for TTNs the CRM itself created via the
  // API (order.ttn_auto_created); manually-typed TTNs might belong to a
  // shipment that already left our control, so those aren't touchable here.
  const [showCancelTtnDialog, setShowCancelTtnDialog] = useState(false);
  const [cancellingTtn, setCancellingTtn] = useState(false);

  // Warehouse stock-confirmation popup — shown before "Опрацювати замовлення"
  // so a warehouse worker visually confirms every item is physically in
  // stock before the invoice/email pipeline fires.
  const [showStockConfirm, setShowStockConfirm] = useState(false);
  const [stockChecks, setStockChecks] = useState<Record<number, boolean>>({});

  // Resend email — lets a manager fix a typo'd address before either the
  // payment-request or payment-confirmed letter is (re)sent via the
  // preview/edit dialog below, without re-running the whole
  // process/confirm-payment pipeline (no TTN/status side-effects).
  const [resendEmail, setResendEmail] = useState("");
  const [editingResendEmail, setEditingResendEmail] = useState(false);

  // Postomat shipping — Nova Poshta only releases postomat parcels once
  // fully prepaid and wants real per-parcel dimensions (OptionsSeat), so it
  // gets its own button + small form instead of the plain "Підтвердити
  // оплату" flow, which is hidden entirely for postomat destinations.
  const [showPostomatDialog, setShowPostomatDialog] = useState(false);
  const [postomatForm, setPostomatForm] = useState({ weight: "1", length: "20", width: "15", height: "10" });
  const [postomatSubmitting, setPostomatSubmitting] = useState(false);

  // Cash-on-delivery ("накладений платіж") — resolve what would be sent to
  // Nova Poshta first (read-only), show it for review, only then create the
  // TTN. Not offered at all for postomat destinations (see above).
  const [showCodDialog, setShowCodDialog] = useState(false);
  const [codPreview, setCodPreview] = useState<Record<string, unknown> | null>(null);
  const [codPreviewError, setCodPreviewError] = useState("");
  const [codLoadingPreview, setCodLoadingPreview] = useState(false);
  const [codSubmitting, setCodSubmitting] = useState(false);
  const [codAmountInput, setCodAmountInput] = useState("");

  // Передоплата — persisted on the order (`orders.prepayment`) so the
  // накладений платіж amount always reflects what the customer still owes,
  // not the full order total.
  const [prepaymentInput, setPrepaymentInput] = useState("0");
  const [savingPrepayment, setSavingPrepayment] = useState(false);

  // Manual invoice-number generation — the invoice/waybill/email pipeline
  // already falls back to the order id when doc_field_1 isn't set, so this
  // mainly unlocks the "Рахунок"/"Накладна" quick-view buttons without
  // running the full autoProcess pipeline (status change, stock popup).
  const [generatingInvoice, setGeneratingInvoice] = useState(false);

  // Standalone TTN (re)generation from the Manual Control panel — retries
  // just the TTN step (no email/status side-effects), e.g. after a
  // transient Nova Poshta error.
  const [generatingTtn, setGeneratingTtn] = useState(false);
  const [ttnGenError, setTtnGenError] = useState("");

  // Manual control card gets scrolled into view + briefly highlighted when
  // an automated flow (postomat/COD) fails and a manager needs the escape
  // hatch instead of retrying the API.
  const manualCardRef = useRef<HTMLDivElement>(null);
  const [manualHighlight, setManualHighlight] = useState(false);

  // Explicit "Ручне керування" menu — available at every step, mirrors the
  // automatic pipeline's own steps (stock check, invoice, email) but lets a
  // manager trigger each individually instead of running the whole thing.
  const [showManualPanel, setShowManualPanel] = useState(false);
  const [stockCheckResult, setStockCheckResult] = useState<{ status: "ok" | "warn"; msg: string } | null>(null);
  const [stockChecking, setStockChecking] = useState(false);

  // Email preview/edit — review the exact rendered email (and optionally
  // add a personal note) before actually sending it.
  const [showEmailPreview, setShowEmailPreview] = useState(false);
  const [emailPreviewKind, setEmailPreviewKind] = useState<"invoice" | "confirmed" | null>(null);
  const [emailPreviewLoading, setEmailPreviewLoading] = useState(false);
  const [emailPreviewSubject, setEmailPreviewSubject] = useState("");
  const [emailPreviewNote, setEmailPreviewNote] = useState("");
  const [emailPreviewHtml, setEmailPreviewHtml] = useState("");
  const [emailSending, setEmailSending] = useState(false);

  function goToManualControl() {
    setShowPostomatDialog(false);
    setShowCodDialog(false);
    manualCardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    setManualHighlight(true);
    setTimeout(() => setManualHighlight(false), 2200);
  }

  // Client edit
  const [editingClient, setEditingClient] = useState(false);
  const [clientDraft, setClientDraft] = useState({ person: "", phone: "", login: "", addr_delivery: "", pay_method: "" });
  const [savingClient, setSavingClient] = useState(false);

  // Returns
  const [returnProduct, setReturnProduct] = useState("");
  const [returnQty, setReturnQty] = useState("1");
  const [returnReason, setReturnReason] = useState("");
  const [submittingReturn, setSubmittingReturn] = useState(false);

  // Items edit
  const [editingItems, setEditingItems] = useState(false);
  const [savingItemId, setSavingItemId] = useState<number | null>(null);
  const [itemSearch, setItemSearch] = useState("");
  const [itemSearching, setItemSearching] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [itemSearchResults, setItemSearchResults] = useState<any[]>([]);

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    apiFetch<any>(`/api/orders/${params.id}`).then((data) => {
      if (!data) return;
      setOrder(data);
      setStatus(data.status ?? "");
      setNotes(data.notes ?? "");
      setTtn(data.ttn ?? "");
      setResendEmail(data.login ?? "");
      setPrepaymentInput(String(data.prepayment ?? 0));
    });
  }, [params.id]);

  async function refreshOrder() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updated = await apiFetch<any>(`/api/orders/${params.id}`);
    if (updated) { setOrder(updated); setStatus(updated.status ?? ""); setPrepaymentInput(String(updated.prepayment ?? 0)); }
  }

  async function save() {
    setSaving(true);
    // A TTN typed here overwrites whatever it was — if that differs from
    // what's on the order, it's a manual edit, so the "created via CRM"
    // flag (which gates the cancel-TTN button) no longer applies.
    const ttnChanged = ttn.trim() !== (order.ttn ?? "");
    await fetch(`/api/orders/${params.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, notes, ttn: ttn.trim() || null, ...(ttnChanged ? { ttn_auto_created: false } : {}) }),
    });
    toast.success("Збережено!");
    setSaving(false);
    await refreshOrder();
  }

  function openStockConfirm() {
    setStockChecks({});
    setShowStockConfirm(true);
  }

  async function confirmStockAndProcess() {
    setShowStockConfirm(false);
    await autoProcess();
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

  async function submitPostomat() {
    const weight = parseFloat(postomatForm.weight);
    const length = parseFloat(postomatForm.length);
    const width  = parseFloat(postomatForm.width);
    const height = parseFloat(postomatForm.height);
    if (![weight, length, width, height].every((n) => Number.isFinite(n) && n > 0)) {
      toast.error("Заповніть коректні габарити посилки"); return;
    }
    setPostomatSubmitting(true);
    try {
      const res = await fetch(`/api/orders/${params.id}/ttn/postomat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weight, length, width, height }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "Помилка"); return; }
      setConfirmLog(data.log);
      setShowPostomatDialog(false);
      await refreshOrder();
      const hasError = data.log.some((l: StepLog) => l.status === "error");
      if (hasError) toast.warning("Відправлено на поштомат з помилками");
      else          toast.success("ТТН на поштомат створено!");
    } catch { toast.error("Помилка з'єднання"); }
    finally { setPostomatSubmitting(false); }
  }

  async function generateInvoiceManually() {
    setGeneratingInvoice(true);
    try {
      const res = await fetch(`/api/orders/${params.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doc_field_1: order.doc_field_1 || String(order.id) }),
      });
      if (!res.ok) { toast.error("Не вдалося сформувати рахунок"); return; }
      await refreshOrder();
      toast.success("Рахунок сформовано");
    } catch { toast.error("Помилка з'єднання"); }
    finally { setGeneratingInvoice(false); }
  }

  function openManualPanel() {
    setShowManualPanel(true);
    if (!stockCheckResult) runStockCheck();
  }

  async function runStockCheck() {
    setStockChecking(true);
    try {
      const res = await fetch(`/api/orders/${params.id}/stock-check`);
      const data = await res.json();
      setStockCheckResult(data);
    } catch { toast.error("Помилка з'єднання"); }
    finally { setStockChecking(false); }
  }

  async function generateTtnManually() {
    setGeneratingTtn(true);
    setTtnGenError("");
    try {
      const res = await fetch(`/api/orders/${params.id}/ttn/generate`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) { setTtnGenError(data.error ?? "Помилка"); toast.error(data.error ?? "Помилка"); return; }
      await refreshOrder();
      toast.success(data.demo ? `ТТН згенеровано (демо): ${data.ttn}` : `ТТН ${data.ttn} створено`);
    } catch { setTtnGenError("Помилка з'єднання"); toast.error("Помилка з'єднання"); }
    finally { setGeneratingTtn(false); }
  }

  async function openEmailPreview(kind: "invoice" | "confirmed") {
    setEmailPreviewKind(kind);
    setEmailPreviewNote("");
    setEmailPreviewSubject("");
    setEmailPreviewHtml("");
    setShowEmailPreview(true);
    setEmailPreviewLoading(true);
    try {
      const res = await fetch(`/api/orders/${params.id}/email-preview?kind=${kind}`);
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "Помилка"); setShowEmailPreview(false); return; }
      setEmailPreviewSubject(data.subject);
      setEmailPreviewHtml(data.html);
    } catch { toast.error("Помилка з'єднання"); setShowEmailPreview(false); }
    finally { setEmailPreviewLoading(false); }
  }

  async function refreshEmailPreview() {
    if (!emailPreviewKind) return;
    setEmailPreviewLoading(true);
    try {
      const res = await fetch(`/api/orders/${params.id}/email-preview?kind=${emailPreviewKind}&note=${encodeURIComponent(emailPreviewNote)}`);
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "Помилка"); return; }
      setEmailPreviewHtml(data.html);
    } catch { toast.error("Помилка з'єднання"); }
    finally { setEmailPreviewLoading(false); }
  }

  async function sendPreviewedEmail() {
    if (!emailPreviewKind) return;
    const email = resendEmail.trim();
    if (!email) { toast.error("Введіть email отримувача"); return; }
    setEmailSending(true);
    try {
      const res = await fetch(`/api/orders/${params.id}/resend-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: emailPreviewKind, email, subject: emailPreviewSubject, note: emailPreviewNote }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "Помилка надсилання"); return; }
      toast.success("Лист надіслано!");
      setShowEmailPreview(false);
    } catch { toast.error("Помилка з'єднання"); }
    finally { setEmailSending(false); }
  }

  async function cancelTtnNow() {
    setCancellingTtn(true);
    try {
      const res = await fetch(`/api/orders/${params.id}/ttn/cancel`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "Не вдалося скасувати ТТН"); return; }
      setTtn("");
      setShowCancelTtnDialog(false);
      await refreshOrder();
      toast.success(data.demo ? "ТТН скасовано (демо-режим)" : "ТТН скасовано в Новій Пошті");
    } catch { toast.error("Помилка з'єднання"); }
    finally { setCancellingTtn(false); }
  }

  async function savePrepayment() {
    const value = parseFloat(prepaymentInput);
    if (!Number.isFinite(value) || value < 0) { toast.error("Некоректна сума передоплати"); return; }
    setSavingPrepayment(true);
    try {
      const res = await fetch(`/api/orders/${params.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prepayment: value }),
      });
      if (!res.ok) { toast.error("Не вдалося зберегти передоплату"); return; }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setOrder((prev: any) => ({ ...prev, prepayment: value }));
      toast.success("Передоплату збережено");
    } catch { toast.error("Помилка з'єднання"); }
    finally { setSavingPrepayment(false); }
  }

  async function openCodDialog() {
    setShowCodDialog(true);
    setCodPreview(null);
    setCodPreviewError("");
    setCodAmountInput("");
    setCodLoadingPreview(true);
    try {
      const res = await fetch(`/api/orders/${params.id}/ttn/cod`);
      const data = await res.json();
      if (!res.ok) { setCodPreviewError(data.error ?? "Помилка"); return; }
      setCodPreview(data);
      setCodAmountInput(String(data.codAmount));
    } catch { setCodPreviewError("Помилка з'єднання"); }
    finally { setCodLoadingPreview(false); }
  }

  async function confirmCod() {
    const amount = parseFloat(codAmountInput);
    if (!Number.isFinite(amount) || amount <= 0) { toast.error("Некоректна сума накладеного платежу"); return; }
    setCodSubmitting(true);
    try {
      const res = await fetch(`/api/orders/${params.id}/ttn/cod`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codAmount: amount }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "Помилка"); return; }
      setConfirmLog(data.log);
      setShowCodDialog(false);
      await refreshOrder();
      const hasError = data.log.some((l: StepLog) => l.status === "error");
      if (hasError) toast.warning("Відправлено накладеним платежем з помилками");
      else          toast.success("ТТН з накладеним платежем створено!");
    } catch { toast.error("Помилка з'єднання"); }
    finally { setCodSubmitting(false); }
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
      body: JSON.stringify({ status: "Відправлено", notes, ttn: digits, ttn_auto_created: false }),
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

  async function checkNpStatus() {
    setCheckingNp(true);
    try {
      const res = await fetch(`/api/cron/sync-ttn-status?orderId=${params.id}`);
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "Помилка"); return; }
      const entry = data.log?.[0];
      if (!entry) { toast.info("Нема ТТН для перевірки"); return; }
      if (entry.error) { toast.error(entry.error); return; }
      if (entry.delivered) {
        toast.success("Нова Пошта підтвердила отримання — статус оновлено");
        await refreshOrder();
      } else {
        toast.info(`Статус НП: ${entry.status || "ще в дорозі"}`);
      }
    } catch { toast.error("Помилка з'єднання"); }
    finally { setCheckingNp(false); }
  }

  function startEditClient() {
    setClientDraft({
      person: order.person ?? "",
      phone: order.phone ?? "",
      login: order.login ?? "",
      addr_delivery: order.addr_delivery ?? "",
      pay_method: order.pay_method ?? "",
    });
    setEditingClient(true);
  }

  async function saveClient() {
    setSavingClient(true);
    const res = await fetch(`/api/orders/${params.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(clientDraft),
    });
    setSavingClient(false);
    if (!res.ok) { toast.error("Не вдалося зберегти дані клієнта"); return; }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setOrder((prev: any) => ({ ...prev, ...clientDraft }));
    setEditingClient(false);
    toast.success("Дані клієнта оновлено");
  }

  function updateItemField(itemId: number, field: "price" | "quantity", value: string) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setOrder((prev: any) => ({
      ...prev,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      items: prev.items.map((i: any) => (i.id === itemId ? { ...i, [field]: value } : i)),
    }));
  }

  async function saveItem(itemId: number) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const item = order.items.find((i: any) => i.id === itemId);
    if (!item) return;
    const price = parseFloat(item.price);
    const quantity = parseInt(item.quantity);
    if (!Number.isFinite(price) || price < 0 || !Number.isFinite(quantity) || quantity < 1) {
      toast.error("Некоректна ціна або кількість");
      return;
    }
    setSavingItemId(itemId);
    const res = await fetch(`/api/orders/${params.id}/items/${itemId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ price, quantity }),
    });
    setSavingItemId(null);
    if (!res.ok) { toast.error("Не вдалося зберегти товар"); return; }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setOrder((prev: any) => ({
      ...prev,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      items: prev.items.map((i: any) => (i.id === itemId ? { ...i, price, quantity } : i)),
    }));
    toast.success("Товар оновлено");
  }

  async function deleteItem(itemId: number) {
    setSavingItemId(itemId);
    const res = await fetch(`/api/orders/${params.id}/items/${itemId}`, { method: "DELETE" });
    setSavingItemId(null);
    if (!res.ok) { toast.error("Не вдалося видалити товар"); return; }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setOrder((prev: any) => ({ ...prev, items: prev.items.filter((i: any) => i.id !== itemId) }));
    toast.success("Товар видалено");
  }

  async function searchProducts(q: string) {
    setItemSearch(q);
    if (!q.trim()) { setItemSearchResults([]); return; }
    setItemSearching(true);
    const data = await apiFetch<{ items: { id: number; title: string; pcode: string | null; price: number }[] }>(
      `/api/products?q=${encodeURIComponent(q)}&lang=uk&limit=8`
    );
    setItemSearching(false);
    setItemSearchResults(data?.items ?? []);
  }

  async function addItem(product: { id: number; title: string; price: number }) {
    const res = await fetch(`/api/orders/${params.id}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ product: product.id, price: product.price, quantity: 1 }),
    });
    if (!res.ok) { toast.error("Не вдалося додати товар"); return; }
    const item = await res.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setOrder((prev: any) => ({ ...prev, items: [...(prev.items ?? []), item] }));
    setItemSearch("");
    setItemSearchResults([]);
    toast.success(`Додано: ${product.title}`);
  }

  async function submitReturn() {
    const product = parseInt(returnProduct);
    const qty = parseInt(returnQty);
    if (!Number.isFinite(product) || !Number.isFinite(qty) || qty < 1) {
      toast.error("Оберіть товар і вкажіть кількість");
      return;
    }
    setSubmittingReturn(true);
    const res = await fetch(`/api/orders/${params.id}/returns`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ product, qty, reason: returnReason.trim() || undefined }),
    });
    setSubmittingReturn(false);
    if (!res.ok) { toast.error("Не вдалося оформити повернення"); return; }
    const ret = await res.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setOrder((prev: any) => ({ ...prev, returns: [ret, ...(prev.returns ?? [])] }));
    setReturnProduct("");
    setReturnQty("1");
    setReturnReason("");
    toast.success("Повернення заявлено — товар повернеться на склад після підтвердження отримання");
  }

  async function setReturnStatus(returnId: number, newStatus: string) {
    const res = await fetch(`/api/returns/${returnId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    if (!res.ok) { const e = await res.json(); toast.error(e.error ?? "Помилка"); return; }
    const updated = await res.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setOrder((prev: any) => ({
      ...prev,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      returns: prev.returns.map((r: any) => (r.id === returnId ? updated : r)),
    }));
    toast.success(`Статус повернення: «${newStatus}»`);
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
  const npParsed    = order.addr_delivery ? parseNpAddress(order.addr_delivery) : null;
  const isPostomat  = npParsed?.isPostomat ?? false;

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
                    Натисніть «Опрацювати» — сформується рахунок та клієнту надійде email з рахунком і накладною.
                  </p>
                  <div>
                    <Button
                      onClick={openStockConfirm} disabled={processing}
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
                        Рахунок
                      </button>
                      <button
                        onClick={() => window.open(`/api/orders/${params.id}/waybill`, "_blank")}
                        style={{ padding: "3px 12px", borderRadius: 6, fontSize: 12, fontWeight: 600, background: "rgba(16,185,129,0.12)", color: "#059669", border: "1px solid rgba(16,185,129,0.22)", cursor: "pointer" }}
                      >
                        Накладна
                      </button>
                    </div>
                  )}
                  {isPostomat ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                      <Button
                        onClick={() => setShowPostomatDialog(true)}
                        style={{ background: "linear-gradient(135deg,#3b82f6,#2563eb)", border: "none", color: "#fff", gap: 8, height: 42, fontSize: 14 }}
                      >
                        <PackageSearch size={16} />
                        Відправити на поштомат
                      </Button>
                      <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                        Поштомат — видача лише після повної передоплати, накладений платіж тут неможливий
                      </span>
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                        <Button
                          onClick={confirmPayment} disabled={confirming}
                          style={{ background: "linear-gradient(135deg,#3b82f6,#2563eb)", border: "none", color: "#fff", gap: 8, height: 42, fontSize: 14 }}
                        >
                          {confirming ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard size={16} />}
                          Підтвердити оплату
                        </Button>
                        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Оплата вже надійшла (переказ) — автоматично створить ТТН</span>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                          <Button
                            variant="outline" onClick={openCodDialog}
                            style={{ gap: 8, height: 42, fontSize: 14 }}
                          >
                            <Banknote size={16} />
                            Відправити накладеним платежем
                          </Button>
                          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                            Отримувач сплачує {Math.max(0, orderTotal - (parseFloat(prepaymentInput) || 0)).toFixed(2)} грн при отриманні
                          </span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <Label style={{ fontSize: 12, color: "var(--text-muted)" }}>Врахувати передоплату, грн</Label>
                          <Input
                            type="number" step="0.01" min="0" value={prepaymentInput}
                            onChange={(e) => setPrepaymentInput(e.target.value)}
                            style={{ width: 110, height: 30, fontSize: 13 }}
                          />
                          <button
                            onClick={savePrepayment} disabled={savingPrepayment}
                            style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 6, fontSize: 12, fontWeight: 600, background: "rgba(99,102,241,0.1)", color: "#6366f1", border: "none", cursor: "pointer" }}
                          >
                            {savingPrepayment ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check size={12} />} Зберегти для замовлення
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
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
                      {order.ttn_auto_created && (
                        <button
                          onClick={() => setShowCancelTtnDialog(true)}
                          style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "none", border: "none", cursor: "pointer", color: "#dc2626", fontSize: 12, padding: 0 }}
                        >
                          <XCircle size={11} /> Скасувати
                        </button>
                      )}
                    </div>
                  ) : (
                    /* TTN відсутній — можна спробувати згенерувати автоматично ще раз, або ввести вручну */
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                        <Button
                          variant="outline" onClick={generateTtnManually} disabled={generatingTtn}
                          style={{ gap: 8 }}
                        >
                          {generatingTtn ? <Loader2 className="h-4 w-4 animate-spin" /> : <Truck size={15} />}
                          {ttnGenError ? "Спробувати ще раз" : "Згенерувати ТТН автоматично"}
                        </Button>
                        {ttnGenError && (
                          <span style={{ fontSize: 12, color: "#dc2626", display: "flex", alignItems: "center", gap: 4 }}>
                            <XCircle size={12} /> {ttnGenError}
                          </span>
                        )}
                      </div>

                      <Label style={{ fontSize: 13 }}>Або введіть номер ТТН вручну</Label>
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
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <Button
                      onClick={() => advanceStatus("Завершено")}
                      style={{ background: "linear-gradient(135deg,#10b981,#059669)", border: "none", color: "#fff", gap: 8, height: 42, fontSize: 14 }}
                    >
                      <MapPin size={16} />
                      Позначити отриманим / завершити
                    </Button>
                    <Button
                      variant="outline" onClick={checkNpStatus} disabled={checkingNp}
                      style={{ gap: 8, height: 42, fontSize: 14 }}
                    >
                      {checkingNp ? <Loader2 className="h-4 w-4 animate-spin" /> : <Truck size={16} />}
                      Перевірити статус НП
                    </Button>
                  </div>
                </div>
              )}

              {/* Step 3 — Завершено (клієнт отримав — це вже фінальний крок) */}
              {step === 3 && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 10, background: "rgba(5,150,105,0.1)" }}>
                  <Star size={16} color="#059669" />
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#059669" }}>Замовлення успішно завершено</span>
                </div>
              )}

              {step < 3 && (
                <Button
                  variant="outline" onClick={openManualPanel}
                  style={{ marginTop: 14, gap: 8 }}
                >
                  <SlidersHorizontal size={14} /> Ручне керування — минаючи автоматику
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {/* ── WAREHOUSE STOCK-CONFIRMATION POPUP ─────────────────────────── */}
        <Dialog open={showStockConfirm} onOpenChange={setShowStockConfirm}>
          <DialogContent style={{ maxWidth: 480 }}>
            <DialogHeader>
              <DialogTitle style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Package size={16} /> Перевірка наявності на складі
              </DialogTitle>
            </DialogHeader>
            <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "-4px 0 4px" }}>
              Позначте кожен товар, переконавшись, що він фізично є на складі, перед формуванням рахунку та відправкою листа клієнту.
            </p>
            <div style={{ maxHeight: 340, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {order.items?.map((item: any) => (
                <label
                  key={item.id}
                  style={{
                    display: "flex", alignItems: "center", gap: 10, padding: "8px 10px",
                    borderRadius: 8, border: "1px solid var(--border)", cursor: "pointer",
                    background: stockChecks[item.id] ? "rgba(16,185,129,0.08)" : "transparent",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={!!stockChecks[item.id]}
                    onChange={(e) => setStockChecks((prev) => ({ ...prev, [item.id]: e.target.checked }))}
                    style={{ width: 17, height: 17, flexShrink: 0, cursor: "pointer" }}
                  />
                  {item.productImg ? (
                    <img src={item.productImg} alt="" style={{ width: 32, height: 32, objectFit: "cover", borderRadius: 6, flexShrink: 0, background: "var(--bg)" }} />
                  ) : (
                    <div style={{ width: 32, height: 32, borderRadius: 6, flexShrink: 0, background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Package size={14} color="var(--text-muted)" />
                    </div>
                  )}
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {item.productTitle ?? `Товар #${item.product}`}
                    </div>
                    <div className="font-mono" style={{ fontSize: 11, color: "var(--text-muted)" }}>
                      {item.productPcode ? `${item.productPcode} · ` : ""}{item.quantity} шт
                    </div>
                  </div>
                </label>
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 4 }}>
              <Button variant="outline" onClick={() => setShowStockConfirm(false)}>Скасувати</Button>
              <Button
                onClick={confirmStockAndProcess}
                disabled={!order.items?.length || !order.items.every((i: { id: number }) => stockChecks[i.id])}
                style={{ background: "linear-gradient(135deg,#f59e0b,#d97706)", border: "none", color: "#fff", gap: 8 }}
              >
                <Zap size={15} /> Підтвердити і опрацювати
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* ── POSTOMAT SHIPPING ────────────────────────────────────────────── */}
        <Dialog open={showPostomatDialog} onOpenChange={setShowPostomatDialog}>
          <DialogContent style={{ maxWidth: 420 }}>
            <DialogHeader>
              <DialogTitle style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <PackageSearch size={16} /> Відправка на поштомат
              </DialogTitle>
            </DialogHeader>
            <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "-4px 0 4px" }}>
              Нова Пошта вимагає точні габарити посилки для поштоматів. Накладений платіж тут неможливий — видача лише після повної передоплати.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div className="space-y-1.5">
                <Label>Вага, кг</Label>
                <Input type="number" step="0.1" min="0.1" value={postomatForm.weight}
                  onChange={(e) => setPostomatForm((p) => ({ ...p, weight: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Довжина, см</Label>
                <Input type="number" step="1" min="1" value={postomatForm.length}
                  onChange={(e) => setPostomatForm((p) => ({ ...p, length: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Ширина, см</Label>
                <Input type="number" step="1" min="1" value={postomatForm.width}
                  onChange={(e) => setPostomatForm((p) => ({ ...p, width: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Висота, см</Label>
                <Input type="number" step="1" min="1" value={postomatForm.height}
                  onChange={(e) => setPostomatForm((p) => ({ ...p, height: e.target.value }))} />
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
              <button
                onClick={goToManualControl}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: 12, padding: 0 }}
              >
                <SlidersHorizontal size={12} /> Ввести ТТН вручну
              </button>
              <div style={{ display: "flex", gap: 10 }}>
                <Button variant="outline" onClick={() => setShowPostomatDialog(false)}>Скасувати</Button>
                <Button
                  onClick={submitPostomat} disabled={postomatSubmitting}
                  style={{ background: "linear-gradient(135deg,#3b82f6,#2563eb)", border: "none", color: "#fff", gap: 8 }}
                >
                  {postomatSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackageSearch size={15} />}
                  Створити ТТН
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* ── CASH ON DELIVERY (НАКЛАДЕНИЙ ПЛАТІЖ) ───────────────────────── */}
        <Dialog open={showCodDialog} onOpenChange={setShowCodDialog}>
          <DialogContent style={{ maxWidth: 460 }}>
            <DialogHeader>
              <DialogTitle style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Banknote size={16} /> Відправка накладеним платежем
              </DialogTitle>
            </DialogHeader>

            {codLoadingPreview ? (
              <div style={{ padding: 24, textAlign: "center" }}><Loader2 className="h-5 w-5 animate-spin" style={{ margin: "0 auto" }} /></div>
            ) : codPreviewError ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "10px 14px", borderRadius: 10, background: "rgba(239,68,68,0.1)" }}>
                  <XCircle size={16} color="#dc2626" style={{ flexShrink: 0, marginTop: 1 }} />
                  <span style={{ fontSize: 13, color: "#dc2626" }}>{codPreviewError}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                  <Button variant="outline" onClick={() => setShowCodDialog(false)}>Закрити</Button>
                  <Button onClick={goToManualControl} style={{ background: "linear-gradient(135deg,#6366f1,#8b5cf6)", border: "none", color: "#fff", gap: 8 }}>
                    <SlidersHorizontal size={15} /> Перейти в ручний режим
                  </Button>
                </div>
              </div>
            ) : codPreview ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>
                  Ці параметри будуть надіслані в Нову Пошту для формування ТТН — перевірте перед підтвердженням.
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "12px 14px", borderRadius: 10, background: "var(--bg)", fontSize: 13 }}>
                  <div><span style={{ color: "var(--text-muted)" }}>Отримувач:</span> <strong>{String(codPreview.recipientName)}</strong> · {String(codPreview.recipientPhone)}</div>
                  <div><span style={{ color: "var(--text-muted)" }}>Місто / відділення:</span> {String(codPreview.city)} — Відділення №{String(codPreview.warehouseNum)}</div>
                  <div><span style={{ color: "var(--text-muted)" }}>Вага:</span> {String(codPreview.weight)} кг</div>
                  <div><span style={{ color: "var(--text-muted)" }}>Вартість оголошена:</span> {Number(codPreview.cost).toFixed(2)} грн</div>
                  <div><span style={{ color: "var(--text-muted)" }}>Сума замовлення:</span> {Number(codPreview.orderTotal).toFixed(2)} грн</div>
                  {Number(codPreview.prepayment) > 0 && (
                    <div><span style={{ color: "var(--text-muted)" }}>Передоплата:</span> −{Number(codPreview.prepayment).toFixed(2)} грн</div>
                  )}
                  <div style={{ paddingTop: 6, borderTop: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8 }}>
                    <Label style={{ margin: 0 }}>Накладений платіж (сплатить отримувач):</Label>
                    <Input
                      type="number" step="0.01" min="0.01" value={codAmountInput}
                      onChange={(e) => setCodAmountInput(e.target.value)}
                      style={{ width: 110, height: 30, fontSize: 13, fontWeight: 700, color: "#059669" }}
                    />
                    <span style={{ color: "var(--text-muted)" }}>грн</span>
                  </div>
                  {!!codPreview.demo && (
                    <div style={{ fontSize: 12, color: "#d97706" }}>Увімкнено демо-режим — реального звернення до Нової Пошти не буде, ТТН буде згенеровано випадково.</div>
                  )}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <button
                    onClick={goToManualControl}
                    style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: 12, padding: 0 }}
                  >
                    <SlidersHorizontal size={12} /> Ввести ТТН вручну
                  </button>
                  <div style={{ display: "flex", gap: 10 }}>
                    <Button variant="outline" onClick={() => setShowCodDialog(false)}>Скасувати</Button>
                    <Button
                      onClick={confirmCod} disabled={codSubmitting}
                      style={{ background: "linear-gradient(135deg,#059669,#047857)", border: "none", color: "#fff", gap: 8 }}
                    >
                      {codSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check size={15} />}
                      Підтвердити і сформувати ТТН
                    </Button>
                  </div>
                </div>
              </div>
            ) : null}
          </DialogContent>
        </Dialog>

        {/* ── CANCEL TTN ───────────────────────────────────────────────────── */}
        <Dialog open={showCancelTtnDialog} onOpenChange={setShowCancelTtnDialog}>
          <DialogContent style={{ maxWidth: 420 }}>
            <DialogHeader>
              <DialogTitle style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <XCircle size={16} color="#dc2626" /> Скасувати ТТН
              </DialogTitle>
            </DialogHeader>
            <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "-4px 0 4px" }}>
              ТТН <strong className="font-mono">{order.ttn}</strong> буде видалено в Новій Пошті. Це можливо лише поки посилку ще не прийняли на відправлення — якщо вона вже прийнята, Нова Пошта поверне помилку і скасувати можна буде лише вручну через їхню підтримку.
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <Button variant="outline" onClick={() => setShowCancelTtnDialog(false)}>Ні, залишити</Button>
              <Button
                onClick={cancelTtnNow} disabled={cancellingTtn}
                style={{ background: "linear-gradient(135deg,#ef4444,#dc2626)", border: "none", color: "#fff", gap: 8 }}
              >
                {cancellingTtn ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle size={15} />}
                Так, скасувати ТТН
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* ── MANUAL CONTROL PANEL ────────────────────────────────────────── */}
        <Dialog open={showManualPanel} onOpenChange={setShowManualPanel}>
          <DialogContent style={{ maxWidth: 540 }}>
            <DialogHeader>
              <DialogTitle style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <SlidersHorizontal size={16} /> Ручне керування
              </DialogTitle>
            </DialogHeader>
            <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "-4px 0 4px" }}>
              Ті самі кроки, що й автоматичне опрацювання — виконайте будь-який з них окремо.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 12px", borderRadius: 8, background: stockCheckResult ? STEP_BG[stockCheckResult.status] : "var(--bg)" }}>
                <span style={{ marginTop: 1, flexShrink: 0 }}>
                  {stockChecking ? <Loader2 className="h-4 w-4 animate-spin" /> : stockCheckResult ? STEP_ICON[stockCheckResult.status] : <Package size={15} color="var(--text-muted)" />}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>Наявність на складі</div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{stockCheckResult ? stockCheckResult.msg : "Порівнює товари замовлення із залишками на складі"}</div>
                </div>
                <Button variant="outline" size="sm" onClick={runStockCheck} disabled={stockChecking}>Перевірити</Button>
              </div>

              <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 12px", borderRadius: 8, background: order.doc_field_1 ? STEP_BG.ok : "var(--bg)" }}>
                <span style={{ marginTop: 1, flexShrink: 0 }}>
                  {generatingInvoice ? <Loader2 className="h-4 w-4 animate-spin" /> : order.doc_field_1 ? STEP_ICON.ok : <FileText size={15} color="var(--text-muted)" />}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>Формування рахунку</div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{order.doc_field_1 ? `Рахунок №${order.doc_field_1} сформовано` : "Ще не сформовано"}</div>
                </div>
                <Button variant="outline" size="sm" onClick={generateInvoiceManually} disabled={generatingInvoice}>Згенерувати</Button>
              </div>

              <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 12px", borderRadius: 8, background: order.ttn ? STEP_BG.ok : ttnGenError ? STEP_BG.error : "var(--bg)" }}>
                <span style={{ marginTop: 1, flexShrink: 0 }}>
                  {generatingTtn ? <Loader2 className="h-4 w-4 animate-spin" /> : order.ttn ? STEP_ICON.ok : ttnGenError ? STEP_ICON.error : <Truck size={15} color="var(--text-muted)" />}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>Формування ТТН</div>
                  <div style={{ fontSize: 12, color: ttnGenError && !order.ttn ? "#dc2626" : "var(--text-muted)" }}>
                    {order.ttn ? `ТТН ${order.ttn}` : ttnGenError || "Ще не сформовано"}
                  </div>
                </div>
                {order.ttn ? (
                  order.ttn_auto_created && (
                    <Button variant="outline" size="sm" onClick={() => { setShowManualPanel(false); setShowCancelTtnDialog(true); }}>Скасувати</Button>
                  )
                ) : (
                  <Button variant="outline" size="sm" onClick={generateTtnManually} disabled={generatingTtn}>
                    {ttnGenError ? "Перегенерувати" : "Згенерувати"}
                  </Button>
                )}
              </div>

              <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 12px", borderRadius: 8, background: "var(--bg)" }}>
                <span style={{ marginTop: 1, flexShrink: 0 }}><Mail size={15} color="var(--text-muted)" /></span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>Email клієнту</div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Перегляд і редагування тексту перед відправкою</div>
                </div>
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  <Button variant="outline" size="sm" onClick={() => { setShowManualPanel(false); openEmailPreview("invoice"); }}>Рахунок</Button>
                  {step >= 1 && (
                    <Button variant="outline" size="sm" onClick={() => { setShowManualPanel(false); openEmailPreview("confirmed"); }}>Лист-подяка</Button>
                  )}
                </div>
              </div>
            </div>

            <button
              onClick={() => { setShowManualPanel(false); goToManualControl(); }}
              style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: 12, padding: 0 }}
            >
              <SlidersHorizontal size={12} /> Статус і ТТН вручну →
            </button>
          </DialogContent>
        </Dialog>

        {/* ── EMAIL PREVIEW / EDIT / SEND ─────────────────────────────────── */}
        <Dialog open={showEmailPreview} onOpenChange={setShowEmailPreview}>
          <DialogContent style={{ maxWidth: 640 }}>
            <DialogHeader>
              <DialogTitle style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Mail size={16} /> {emailPreviewKind === "confirmed" ? "Лист-подяка" : "Рахунок клієнту"} — перегляд перед надсиланням
              </DialogTitle>
            </DialogHeader>

            {emailPreviewLoading && !emailPreviewHtml ? (
              <div style={{ padding: 24, textAlign: "center" }}><Loader2 className="h-5 w-5 animate-spin" style={{ margin: "0 auto" }} /></div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div className="space-y-1.5">
                  <Label>Кому</Label>
                  <Input value={resendEmail} onChange={(e) => setResendEmail(e.target.value)} placeholder="client@example.com" />
                </div>
                <div className="space-y-1.5">
                  <Label>Тема листа</Label>
                  <Input value={emailPreviewSubject} onChange={(e) => setEmailPreviewSubject(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Персональне повідомлення (необов&apos;язково, з&apos;явиться жовтим блоком у листі)</Label>
                  <Textarea
                    rows={3} value={emailPreviewNote}
                    onChange={(e) => setEmailPreviewNote(e.target.value)}
                    placeholder="напр. Вибачте за затримку, ваше замовлення вже в дорозі..."
                  />
                  <button
                    onClick={refreshEmailPreview} disabled={emailPreviewLoading}
                    style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: "var(--accent)", fontSize: 12, padding: 0 }}
                  >
                    {emailPreviewLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Pencil size={12} />} Оновити перегляд листа
                  </button>
                </div>
                <div className="space-y-1.5">
                  <Label>Перегляд листа</Label>
                  <iframe
                    srcDoc={emailPreviewHtml}
                    sandbox=""
                    style={{ width: "100%", height: 380, border: "1px solid var(--border)", borderRadius: 8, background: "#fff" }}
                  />
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                  <Button variant="outline" onClick={() => setShowEmailPreview(false)}>Закрити</Button>
                  <Button
                    onClick={sendPreviewedEmail} disabled={emailSending}
                    style={{ background: "linear-gradient(135deg,#6366f1,#8b5cf6)", border: "none", color: "#fff", gap: 8 }}
                  >
                    {emailSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail size={15} />}
                    Надіслати
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* ── RESEND EMAIL ──────────────────────────────────────────────── */}
        {!isCancelled && step >= -1 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Mail size={14} color="var(--accent)" />
                Email клієнту
              </CardTitle>
            </CardHeader>
            <CardContent style={{ paddingTop: 0, display: "flex", flexDirection: "column", gap: 12 }}>
              {editingResendEmail ? (
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <Input
                    value={resendEmail}
                    onChange={(e) => setResendEmail(e.target.value)}
                    placeholder="client@example.com"
                    style={{ maxWidth: 320 }}
                  />
                  <Button variant="outline" size="sm" onClick={() => setEditingResendEmail(false)}>Готово</Button>
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                  <span style={{ color: "var(--text-muted)" }}>Адреса:</span>
                  <strong>{resendEmail || "не вказано"}</strong>
                  <button
                    onClick={() => setEditingResendEmail(true)}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "var(--accent)", display: "flex", alignItems: "center", gap: 4, fontSize: 12, padding: 0 }}
                  >
                    <Pencil size={12} /> Змінити
                  </button>
                </div>
              )}

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <Button variant="outline" size="sm" onClick={() => openEmailPreview("invoice")}>
                  <Mail size={14} />
                  {step === -1 ? "Рахунок — переглянути й надіслати" : "Рахунок — переглянути й надіслати повторно"}
                </Button>
                {step >= 1 && (
                  <Button variant="outline" size="sm" onClick={() => openEmailPreview("confirmed")}>
                    <Mail size={14} />
                    Лист-подяка — переглянути й надіслати повторно
                  </Button>
                )}
              </div>
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
                <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end", gap: 8 }}>
                  <button
                    onClick={() => window.open(`/api/orders/${params.id}/invoice`, "_blank")}
                    style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 18px", borderRadius: 8, fontSize: 13, fontWeight: 600, background: "linear-gradient(135deg,#6366f1,#8b5cf6)", color: "#fff", border: "none", cursor: "pointer" }}
                  >
                    <FileText size={14} /> Рахунок-фактура
                  </button>
                  <button
                    onClick={() => window.open(`/api/orders/${params.id}/waybill`, "_blank")}
                    style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 18px", borderRadius: 8, fontSize: 13, fontWeight: 600, background: "linear-gradient(135deg,#10b981,#059669)", color: "#fff", border: "none", cursor: "pointer" }}
                  >
                    <ClipboardList size={14} /> Накладна
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
            <CardHeader style={{ display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <CardTitle className="text-sm">Клієнт</CardTitle>
              {!editingClient ? (
                <button
                  onClick={startEditClient}
                  style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 10px", borderRadius: 6, fontSize: 12, fontWeight: 600, background: "rgba(99,102,241,0.1)", color: "#6366f1", border: "none", cursor: "pointer" }}
                >
                  <Pencil size={12} /> Редагувати
                </button>
              ) : (
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    onClick={() => setEditingClient(false)}
                    style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 10px", borderRadius: 6, fontSize: 12, fontWeight: 600, background: "rgba(148,163,184,0.15)", color: "#64748b", border: "none", cursor: "pointer" }}
                  >
                    <X size={12} /> Скасувати
                  </button>
                  <button
                    onClick={saveClient} disabled={savingClient}
                    style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 10px", borderRadius: 6, fontSize: 12, fontWeight: 600, background: "#6366f1", color: "#fff", border: "none", cursor: "pointer" }}
                  >
                    {savingClient ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check size={12} />} Зберегти
                  </button>
                </div>
              )}
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              {editingClient ? (
                <div className="space-y-2.5">
                  <div className="space-y-1">
                    <Label style={{ fontSize: 12 }}>Ім&apos;я</Label>
                    <Input value={clientDraft.person} onChange={(e) => setClientDraft((d) => ({ ...d, person: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label style={{ fontSize: 12 }}>Телефон</Label>
                    <Input value={clientDraft.phone} onChange={(e) => setClientDraft((d) => ({ ...d, phone: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label style={{ fontSize: 12 }}>Логін</Label>
                    <Input value={clientDraft.login} onChange={(e) => setClientDraft((d) => ({ ...d, login: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label style={{ fontSize: 12 }}>Адреса</Label>
                    <Input value={clientDraft.addr_delivery} onChange={(e) => setClientDraft((d) => ({ ...d, addr_delivery: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label style={{ fontSize: 12 }}>Спосіб оплати</Label>
                    <Input value={clientDraft.pay_method} onChange={(e) => setClientDraft((d) => ({ ...d, pay_method: e.target.value }))} />
                  </div>
                </div>
              ) : (
                <>
                  <div><span className="text-gray-500">Ім&apos;я:</span> {order.person ?? "—"}</div>
                  <div><span className="text-gray-500">Телефон:</span> {order.phone ?? "—"}</div>
                  <div><span className="text-gray-500">Логін:</span> {order.login ?? "—"}</div>
                  <div><span className="text-gray-500">Адреса:</span> {order.addr_delivery ?? "—"}</div>
                </>
              )}
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
                  <button
                    onClick={() => window.open(`/api/orders/${params.id}/waybill`, "_blank")}
                    style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 10px", borderRadius: 6, fontSize: 12, fontWeight: 600, background: "rgba(16,185,129,0.1)", color: "#059669", border: "none", cursor: "pointer" }}
                  >
                    <ClipboardList size={12} /> Накладна
                  </button>
                </div>
              )}
              {order.pay_method && <div><span className="text-gray-500">Оплата:</span> {order.pay_method}</div>}
              <div><span className="text-gray-500">Дата:</span> {formatDate(order.date)}</div>
            </CardContent>
          </Card>

          {/* Manual control */}
          <Card
            ref={manualCardRef}
            style={manualHighlight ? { borderColor: "#6366f1", boxShadow: "0 0 0 3px rgba(99,102,241,0.25)", transition: "box-shadow 0.3s ease" } : { transition: "box-shadow 0.3s ease" }}
          >
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
                {order.ttn_auto_created && order.ttn && ttn.trim() === order.ttn && (
                  <button
                    onClick={() => setShowCancelTtnDialog(true)}
                    style={{ display: "inline-flex", alignItems: "center", gap: 4, marginTop: 2, background: "none", border: "none", cursor: "pointer", color: "#dc2626", fontSize: 12, padding: 0 }}
                  >
                    <XCircle size={12} /> Скасувати ТТН (створений у CRM)
                  </button>
                )}
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
          <CardHeader style={{ display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <CardTitle className="text-sm">Товари замовлення</CardTitle>
            <button
              onClick={() => setEditingItems((v) => !v)}
              style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 10px", borderRadius: 6, fontSize: 12, fontWeight: 600, background: editingItems ? "rgba(148,163,184,0.15)" : "rgba(99,102,241,0.1)", color: editingItems ? "#64748b" : "#6366f1", border: "none", cursor: "pointer" }}
            >
              {editingItems ? <><X size={12} /> Завершити редагування</> : <><Pencil size={12} /> Редагувати</>}
            </button>
          </CardHeader>
          <CardContent style={{ padding: editingItems ? "0 16px 16px" : 0 }}>
            {editingItems && step >= 1 && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", marginBottom: 12, borderRadius: 8, background: "rgba(245,158,11,0.1)", fontSize: 12.5, color: "#92400e" }}>
                <AlertTriangle size={14} style={{ flexShrink: 0 }} />
                Замовлення вже оплачено — зміна кількості тут не перерахує автоматично залишки на складі (списання відбулось один раз при підтвердженні оплати).
              </div>
            )}
            <table className="crm-table">
              <thead>
                <tr>
                  <th>Товар</th>
                  <th style={{ textAlign: "right" }}>Ціна</th>
                  <th style={{ textAlign: "right" }}>К-сть</th>
                  <th style={{ textAlign: "right" }}>Сума</th>
                  {editingItems && <th style={{ textAlign: "right" }}></th>}
                </tr>
              </thead>
              <tbody>
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {order.items?.map((item: any) => (
                  <tr key={item.id}>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        {item.productImg ? (
                          <img
                            src={item.productImg}
                            alt=""
                            style={{ width: 36, height: 36, objectFit: "cover", borderRadius: 6, flexShrink: 0, background: "var(--bg)" }}
                          />
                        ) : (
                          <div style={{ width: 36, height: 36, borderRadius: 6, flexShrink: 0, background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <Package size={16} color="var(--text-muted)" />
                          </div>
                        )}
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 320 }}>
                            {item.productTitle ?? `Товар #${item.product}`}
                          </div>
                          <div className="font-mono" style={{ fontSize: 11, color: "var(--text-muted)" }}>
                            {item.productPcode ? `${item.productPcode} · ` : ""}#{item.product}{item.type ? ` · ${item.type}` : ""}
                          </div>
                        </div>
                      </div>
                    </td>
                    {editingItems ? (
                      <>
                        <td style={{ textAlign: "right" }}>
                          <Input
                            type="number" step="0.01" value={item.price}
                            onChange={(e) => updateItemField(item.id, "price", e.target.value)}
                            style={{ width: 90, textAlign: "right", marginLeft: "auto" }}
                          />
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <Input
                            type="number" step="1" value={item.quantity}
                            onChange={(e) => updateItemField(item.id, "quantity", e.target.value)}
                            style={{ width: 70, textAlign: "right", marginLeft: "auto" }}
                          />
                        </td>
                      </>
                    ) : (
                      <>
                        <td style={{ textAlign: "right" }}>{item.price.toFixed(2)} грн</td>
                        <td style={{ textAlign: "right" }}>{item.quantity}</td>
                      </>
                    )}
                    <td className="font-medium" style={{ textAlign: "right" }}>{(Number(item.price) * Number(item.quantity)).toFixed(2)} грн</td>
                    {editingItems && (
                      <td style={{ textAlign: "right" }}>
                        <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
                          <button
                            onClick={() => saveItem(item.id)} disabled={savingItemId === item.id}
                            style={{ padding: 5, borderRadius: 6, background: "rgba(16,185,129,0.12)", color: "#059669", border: "none", cursor: "pointer", display: "flex" }}
                            title="Зберегти"
                          >
                            {savingItemId === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check size={14} />}
                          </button>
                          <button
                            onClick={() => deleteItem(item.id)} disabled={savingItemId === item.id}
                            style={{ padding: 5, borderRadius: 6, background: "rgba(220,38,38,0.1)", color: "#dc2626", border: "none", cursor: "pointer", display: "flex" }}
                            title="Видалити"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={editingItems ? 4 : 3} className="font-semibold" style={{ textAlign: "right", borderBottom: "none" }}>Разом:</td>
                  <td className="font-bold text-lg" style={{ textAlign: "right", borderBottom: "none" }}>{orderTotal.toFixed(2)} грн</td>
                </tr>
              </tfoot>
            </table>

            {editingItems && (
              <div style={{ marginTop: 14, position: "relative" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Search size={14} color="var(--text-muted)" />
                  <Input
                    value={itemSearch}
                    onChange={(e) => searchProducts(e.target.value)}
                    placeholder="Пошук товару за назвою або артикулом, щоб додати рядок…"
                  />
                  {itemSearching && <Loader2 className="h-4 w-4 animate-spin" style={{ flexShrink: 0 }} />}
                </div>
                {itemSearchResults.length > 0 && (
                  <div style={{ marginTop: 6, border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
                    {itemSearchResults.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => addItem(p)}
                        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", padding: "8px 12px", background: "var(--bg)", border: "none", borderBottom: "1px solid var(--border)", cursor: "pointer", textAlign: "left", fontSize: 13 }}
                      >
                        <span>
                          {p.pcode && <span className="font-mono text-xs" style={{ color: "var(--text-muted)", marginRight: 8 }}>{p.pcode}</span>}
                          {p.title}
                        </span>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "#6366f1", fontWeight: 600, flexShrink: 0, marginLeft: 10 }}>
                          <Plus size={13} /> {p.price?.toFixed?.(2) ?? p.price} грн
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm text-red-600">Повернення</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {order.returns?.length > 0 ? (
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              order.returns.map((ret: any) => (
                <div key={ret.id} className="border-b last:border-0 py-2 text-sm" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                  <div>
                    <span className="text-gray-500">#{ret.id}</span>{" "}
                    {ret.product ? <>товар #{ret.product} × {ret.qty}</> : (ret.title ?? "")}
                    {ret.reason ? <> — {ret.reason}</> : null}
                    {" "}({formatDate(ret.date)})
                    <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 600, color: RETURN_STATUS_COLOR[ret.status ?? RETURN_STATUS.NEW] ?? "#6b7280" }}>
                      [{ret.status ?? RETURN_STATUS.NEW}]
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
                    {ret.restocked ? (
                      <span style={{ fontSize: 11, fontWeight: 600, color: "#059669", background: "rgba(16,185,129,0.1)", padding: "2px 8px", borderRadius: 6 }}>
                        Повернено на склад
                      </span>
                    ) : ret.status !== RETURN_STATUS.REJECTED && ret.status !== RETURN_STATUS.CANCELLED ? (
                      <button
                        onClick={() => setReturnStatus(ret.id, RETURN_STATUS.RECEIVED)}
                        style={{ fontSize: 11, fontWeight: 600, color: "#059669", background: "rgba(16,185,129,0.1)", padding: "2px 8px", borderRadius: 6, border: "none", cursor: "pointer" }}
                      >
                        Отримано на складі
                      </button>
                    ) : null}
                  </div>
                </div>
              ))
            ) : (
              <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>Повернень по цьому замовленню ще не було.</p>
            )}

            <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap", paddingTop: 8, borderTop: "1px solid var(--border)" }}>
              <div className="space-y-1">
                <Label style={{ fontSize: 12 }}>Товар</Label>
                <select
                  value={returnProduct}
                  onChange={(e) => setReturnProduct(e.target.value)}
                  className="crm-select"
                  style={{ height: 36, borderRadius: 8, border: "1px solid var(--border)", padding: "0 8px", background: "var(--bg)" }}
                >
                  <option value="">Оберіть товар…</option>
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {order.items?.map((item: any) => (
                    <option key={item.id} value={item.product}>{item.productTitle ?? `Товар #${item.product}`} (замовлено {item.quantity})</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label style={{ fontSize: 12 }}>К-сть</Label>
                <Input type="number" min={1} value={returnQty} onChange={(e) => setReturnQty(e.target.value)} style={{ width: 80 }} />
              </div>
              <div className="space-y-1" style={{ flex: 1, minWidth: 160 }}>
                <Label style={{ fontSize: 12 }}>Причина</Label>
                <Input value={returnReason} onChange={(e) => setReturnReason(e.target.value)} placeholder="напр. брак" />
              </div>
              <Button onClick={submitReturn} disabled={submittingReturn} variant="outline">
                {submittingReturn ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />}
                Оформити повернення
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
