"use client";
import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { parseNpAddress } from "@/lib/nova-poshta";
import { Header } from "@/components/admin/header";
import { BusyOverlay } from "@/components/admin/busy-overlay";
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
import { orderStatusLabel } from "@/lib/order-status";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { NpAddressPicker } from "@/components/admin/np-address-picker";
import {
  ArrowLeft, Loader2, Zap, Check, CheckCircle2, XCircle,
  AlertTriangle, MinusCircle, FileText, Package, CreditCard,
  Truck, MapPin, Star, Pencil, Plus, X, Search, ClipboardList,
  Mail, Banknote, PackageSearch, SlidersHorizontal, RotateCcw,
  MessageCircle,
} from "lucide-react";

// "Отримано" used to be its own pipeline step with a separate manual/14-day
// wait before "Завершено" — collapsed into one: once the client has the
// parcel, the order is done, nothing further to wait on.
const PIPELINE = [
  { status: "В роботі",    label: "Опрацювання",  sublabel: "Рахунок + Email",     color: "#d97706" },
  { status: "Оплачено",    label: "Оплата",        sublabel: "Підтверджено",         color: "#2563eb" },
  { status: "Відправлено", label: "Відправлено",   sublabel: "ТТН відстеження",      color: "#7c3aed" },
  { status: "Завершено",   label: "Завершено",     sublabel: "Клієнт отримав",       color: "#059669" },
];

// Nova Poshta's own brand red — used for every action whose primary
// purpose is a Nova Poshta shipment (postomat, cash-on-delivery, manual
// city/warehouse TTN creation), so it's visually obvious which buttons
// leave this app and talk to NP, distinct from this app's own indigo
// accent and from the order-status pipeline colors above. "Підтвердити
// оплату" stays blue (that button's own purpose is payment, not
// shipping, even though it also creates a TTN as a side effect).
const NP_RED = "linear-gradient(135deg,#e4032e,#b8021f)";

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
  // Decides which Nova Poshta sender warehouse a later TTN creation step
  // uses (see lib/order-ttn.ts) — asked here because this is the one place
  // a manager already looks the physical items over before anything else
  // happens to the order.
  const [isOversized, setIsOversized] = useState(false);
  // Forces which supplier (settings "Постачальник 1"/"Постачальник 2") the
  // invoice/waybill for this order is generated from, overriding the
  // automatic amount-vs-threshold pick — "auto" leaves that pick alone.
  const [supplierOverride, setSupplierOverride] = useState<"auto" | "1" | "2">("auto");
  const [supplierNames, setSupplierNames] = useState<{ 1: string; 2: string }>({ 1: "", 2: "" });
  // Client discount %% — prefilled from the order's own override
  // (order.discount_percent) or the client's rank-based default
  // (order.clientDiscountPercent, see lib/pricing.ts), editable here and
  // via the separate "змінити знижку і надіслати повторно" control once
  // the order is already in progress (see resendWithDiscount below).
  const [discountInput, setDiscountInput] = useState("5");
  const [resendingDiscount, setResendingDiscount] = useState(false);

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

  // Manual Nova Poshta city/warehouse picker — the escape hatch offered
  // whenever automatic TTN creation can't parse the order's free-text
  // delivery address (or the city/warehouse it names isn't found in NP):
  // search-as-you-type against NP's own API instead of fixing the address
  // text, then create the TTN with the refs picked here.
  const [showNpManualDialog, setShowNpManualDialog] = useState(false);
  const [npCityQuery, setNpCityQuery] = useState("");
  const [npCityResults, setNpCityResults] = useState<{ ref: string; description: string }[]>([]);
  const [npCitySelected, setNpCitySelected] = useState<{ ref: string; description: string } | null>(null);
  const [npCitySearching, setNpCitySearching] = useState(false);
  const [npWhQuery, setNpWhQuery] = useState("");
  const [npWhResults, setNpWhResults] = useState<{ ref: string; description: string; number: string; isPostomat: boolean }[]>([]);
  const [npWhSelected, setNpWhSelected] = useState<{ ref: string; description: string; number: string; isPostomat: boolean } | null>(null);
  const [npWhSearching, setNpWhSearching] = useState(false);
  const [npManualSeat, setNpManualSeat] = useState({ weight: "1", length: "20", width: "15", height: "10" });
  const [npManualSubmitting, setNpManualSubmitting] = useState(false);
  const [npManualError, setNpManualError] = useState("");

  useEffect(() => {
    if (!showNpManualDialog || npCityQuery.trim().length < 2) return;
    const t = setTimeout(async () => {
      setNpCitySearching(true);
      try {
        const res = await fetch(`/api/nova-poshta/cities?q=${encodeURIComponent(npCityQuery)}`);
        const data = await res.json();
        setNpCityResults(Array.isArray(data) ? data : []);
      } finally {
        setNpCitySearching(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [npCityQuery, showNpManualDialog]);

  useEffect(() => {
    if (!npCitySelected) return;
    const t = setTimeout(async () => {
      setNpWhSearching(true);
      try {
        const res = await fetch(`/api/nova-poshta/warehouses?cityRef=${npCitySelected.ref}&q=${encodeURIComponent(npWhQuery)}`);
        const data = await res.json();
        setNpWhResults(Array.isArray(data) ? data : []);
      } finally {
        setNpWhSearching(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [npWhQuery, npCitySelected]);

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
  const [emailPreviewKind, setEmailPreviewKind] = useState<"invoice" | "confirmed" | "welcome" | null>(null);
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
  // Dashed "+" add-item panel — shared between the main items table and the
  // stock-check popup below, since only one is ever actually visible/
  // interactive at a time (the popup overlays the page).
  const [showAddItem, setShowAddItem] = useState(false);
  // Soft-remove confirm — see toggleItemActive. Removing (unlike restoring)
  // asks first since it releases reserved stock and drops the line from
  // the invoice/TTN weight.
  const [removeItemConfirm, setRemoveItemConfirm] = useState<{ id: number; title: string } | null>(null);

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    apiFetch<any>(`/api/orders/${params.id}`).then((data) => {
      if (!data) return;
      setOrder(data);
      // Legacy raw statuses like "Получен"/"Отримано" (storefront's "we
      // received the order", not a distinct pipeline stage — see
      // isNewStatus() in lib/order-status.ts) get normalized to the
      // canonical "Новий" here, same as everywhere else it's displayed
      // (/orders list, dashboard). Editing this dropdown must never offer
      // the raw legacy string as its own option.
      setStatus(orderStatusLabel(data.status));
      setNotes(data.notes ?? "");
      setTtn(data.ttn ?? "");
      setResendEmail(data.login ?? "");
      setPrepaymentInput(String(data.prepayment ?? 0));
      setDiscountInput(String(data.discount_percent ?? data.clientDiscountPercent ?? 5));
    });
  }, [params.id]);

  // Supplier names shown in parens on the "Постачальник для рахунку"
  // picker in the stock-confirmation popup, so a manager can tell the two
  // apart by who they actually are, not just "1"/"2".
  useEffect(() => {
    apiFetch<{ value: string; text: string }[]>("/api/settings").then((data) => {
      if (!data) return;
      setSupplierNames({
        1: data.find((s) => s.value === "supplier_name")?.text ?? "",
        2: data.find((s) => s.value === "supplier2_name")?.text ?? "",
      });
    });
  }, []);

  async function refreshOrder() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updated = await apiFetch<any>(`/api/orders/${params.id}`);
    // Keep the separate `ttn` input state (manual "Ручне керування" field)
    // in sync with the server value — otherwise it goes stale the moment a
    // TTN is created automatically (confirmPayment/postomat/COD, which
    // only update `order.ttn` via this same refresh), and the next save()
    // from that panel would silently overwrite the real TTN with the
    // stale empty value. See advanceStatus() above for the other half of
    // this same bug class.
    if (updated) { setOrder(updated); setStatus(orderStatusLabel(updated.status)); setPrepaymentInput(String(updated.prepayment ?? 0)); setTtn(updated.ttn ?? ""); }
  }

  // Silently checks Nova Poshta's delivery status once whenever a shipped
  // order with a TTN is opened, so the status advances to "Завершено" on
  // its own instead of only updating via the once-a-day cron
  // (vercel.json) or an explicit "Перевірити статус НП" click. Quiet on
  // failure/not-yet-delivered — this is a background convenience, not a
  // user-initiated action, so it shouldn't toast noise on every visit.
  useEffect(() => {
    if (!order?.ttn) return;
    const s = (order.status ?? "").toLowerCase();
    if (!s.includes("відправлен") && !s.includes("отправлен")) return;
    (async () => {
      try {
        const res = await fetch(`/api/cron/sync-ttn-status?orderId=${params.id}`);
        const data = await res.json();
        const entry = data.log?.[0];
        if (res.ok && entry?.delivered) {
          toast.success("Нова Пошта підтвердила отримання — статус оновлено");
          await refreshOrder();
        } else if (res.ok && entry?.reverted) {
          toast.warning("ТТН ще не здано до відправки — статус повернуто на «Оплачено»");
          await refreshOrder();
        }
      } catch {
        // silent — background check only
      }
    })();
    // params.id/refreshOrder are stable for the life of this page (route
    // param + a function closing over it) — only order's own fields
    // should re-trigger this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.id, order?.ttn, order?.status]);

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
    setIsOversized(false);
    setSupplierOverride("auto");
    setDiscountInput(String(order.discount_percent ?? order.clientDiscountPercent ?? 5));
    setShowStockConfirm(true);
  }

  async function confirmStockAndProcess() {
    setShowStockConfirm(false);
    const discountPercent = parseFloat(discountInput);
    await autoProcess(isOversized, supplierOverride, Number.isFinite(discountPercent) ? discountPercent : undefined);
  }

  async function autoProcess(oversized?: boolean, supplier?: "auto" | "1" | "2", discountPercent?: number) {
    setProcessing(true);
    setProcessLog(null);
    setStatus("В роботі");
    try {
      const res  = await fetch(`/api/orders/${params.id}/process`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          isOversized: oversized,
          supplierOverride: supplier === "1" ? 1 : supplier === "2" ? 2 : null,
          ...(discountPercent !== undefined ? { discountPercent } : {}),
        }),
      });
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

  // "Змінити знижку і надіслати повторно" — used once the order already
  // has an invoice (order.doc_field_1 set): recomputes every active item's
  // price from its price_base at the new %%, regenerates the invoice, and
  // resends it with the "Ми перерахували вартість товару..." copy (see
  // lib/email-templates.ts's "discountChanged" reason) instead of the
  // normal "Наявність підтверджено" text — then leaves the order at "В
  // роботі" (awaiting payment), same as first-time processing.
  async function resendWithDiscount() {
    const discountPercent = parseFloat(discountInput);
    if (!Number.isFinite(discountPercent) || discountPercent < 0) { toast.error("Некоректна знижка"); return; }
    setResendingDiscount(true);
    try {
      const res = await fetch(`/api/orders/${params.id}/process`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ discountPercent }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "Помилка"); return; }
      await refreshOrder();
      const hasError = data.log.some((l: StepLog) => l.status === "error");
      if (hasError) toast.warning("Надіслано з помилками");
      else          toast.success("Знижку застосовано, рахунок надіслано повторно!");
    } catch { toast.error("Помилка з'єднання"); }
    finally { setResendingDiscount(false); }
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

  function openNpManualDialog() {
    setNpCityQuery(""); setNpCityResults([]); setNpCitySelected(null);
    setNpWhQuery(""); setNpWhResults([]); setNpWhSelected(null);
    setNpManualSeat({ weight: "1", length: "20", width: "15", height: "10" });
    setNpManualError("");
    setShowNpManualDialog(true);
  }

  async function submitNpManual() {
    if (!npCitySelected || !npWhSelected) { setNpManualError("Оберіть місто і відділення/поштомат"); return; }
    setNpManualSubmitting(true);
    setNpManualError("");
    try {
      const body: Record<string, unknown> = {
        cityRef: npCitySelected.ref,
        warehouseRef: npWhSelected.ref,
        isPostomat: npWhSelected.isPostomat,
      };
      if (npWhSelected.isPostomat) {
        body.seat = {
          weight: parseFloat(npManualSeat.weight),
          length: parseFloat(npManualSeat.length),
          width: parseFloat(npManualSeat.width),
          height: parseFloat(npManualSeat.height),
        };
      }
      const res = await fetch(`/api/orders/${params.id}/ttn/manual`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setNpManualError(data.error ?? "Помилка"); toast.error(data.error ?? "Помилка"); return; }
      await refreshOrder();
      setShowNpManualDialog(false);
      setTtnGenError("");
      toast.success(data.demo ? `ТТН згенеровано (демо): ${data.ttn}` : `ТТН ${data.ttn} створено`);
    } catch { setNpManualError("Помилка з'єднання"); toast.error("Помилка з'єднання"); }
    finally { setNpManualSubmitting(false); }
  }

  async function openEmailPreview(kind: "invoice" | "confirmed" | "welcome") {
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
      if (emailPreviewKind === "welcome") await refreshOrder();
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
    // Only ever touches status — must NOT include `ttn` here. This is
    // called right after automatic TTN creation (confirmPayment etc.),
    // which updates order.ttn server-side but never syncs the separate
    // local `ttn` input state (that's only for the manual "Ручне
    // керування" TTN field) — sending that stale/empty `ttn` here used to
    // silently null out a just-created real TTN on the very next status
    // click, while leaving ttn_auto_created=true (this PUT never touched
    // it), which is exactly the ttn=null / ttn_auto_created=true state
    // that broke "Перевірити статус НП" for real, trackable shipments.
    await fetch(`/api/orders/${params.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus, notes }),
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
      } else if (entry.reverted) {
        toast.warning(`ТТН ще не здано до відправки — статус повернуто на «Оплачено». ${entry.status ?? ""}`);
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

  // Self-saving quantity field for the stock-check popup — that list has
  // no per-row "Save" button (unlike the main table's editingItems mode),
  // so a quantity edit there persists straight on blur instead. Report:
  // the popup showed quantity as plain "{n} шт" text with no way to
  // change it at all, both for existing lines and ones just added there.
  async function saveItemQuantity(itemId: number, rawQuantity: string) {
    const quantity = parseInt(rawQuantity);
    if (!Number.isFinite(quantity) || quantity < 1) return;
    setSavingItemId(itemId);
    const res = await fetch(`/api/orders/${params.id}/items/${itemId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quantity }),
    });
    setSavingItemId(null);
    if (!res.ok) { toast.error("Не вдалося оновити кількість"); return; }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setOrder((prev: any) => ({
      ...prev,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      items: prev.items.map((i: any) => (i.id === itemId ? { ...i, quantity } : i)),
    }));
  }

  // Soft-remove/restore a line item — see
  // scripts/add-orders-item-active-column.sql. Removing releases the stock
  // this line had reserved and drops it from the invoice/TTN weight (the
  // webhook reacts to this exact PUT — see
  // app/api/webhooks/inventory-sync/route.ts); restoring re-reserves it.
  // The row itself is never deleted — it stays visible, struck through.
  async function toggleItemActive(itemId: number, active: boolean) {
    setSavingItemId(itemId);
    const res = await fetch(`/api/orders/${params.id}/items/${itemId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active }),
    });
    setSavingItemId(null);
    if (!res.ok) { toast.error(active ? "Не вдалося відновити товар" : "Не вдалося прибрати товар"); return; }
    setOrder((prev: any) => ({
      ...prev,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      items: prev.items.map((i: any) => (i.id === itemId ? { ...i, active } : i)),
    }));
    toast.success(active ? "Товар відновлено" : "Товар прибрано із замовлення");
  }

  async function searchProducts(q: string) {
    setItemSearch(q);
    if (!q.trim()) { setItemSearchResults([]); return; }
    setItemSearching(true);
    const data = await apiFetch<{ items: { id: number; title: string; pcode: string | null; price: number; minquantity: number | null }[] }>(
      `/api/products?q=${encodeURIComponent(q)}&lang=uk&limit=8`
    );
    setItemSearching(false);
    setItemSearchResults(data?.items ?? []);
  }

  async function addItem(product: { id: number; title: string; price: number; minquantity: number | null }) {
    // Quantity defaults to the product's own minimum order step
    // (products.minquantity) — the site enforces the same minimum, e.g.
    // 100pc for a product only sold in bags of 100. Price is not sent —
    // the server recomputes it from products.price × the грн currency
    // rate itself (see app/api/orders/[id]/items/route.ts) so this client
    // value is never trusted for the actual insert.
    const quantity = product.minquantity && product.minquantity > 0 ? product.minquantity : 1;
    const res = await fetch(`/api/orders/${params.id}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ product: product.id, quantity }),
    });
    if (!res.ok) { toast.error("Не вдалося додати товар"); return; }
    // POST /api/orders/[id]/items only returns the raw orders_item row —
    // no productTitle/productImg/productPcode/productUrl, those are joined
    // in by GET /api/orders/[id] only. Appending that raw row straight into
    // state (the old behavior) made a freshly-added item show with no
    // photo/title until the next full page reload — refetching here gets
    // the same enrichment every other item already has, immediately.
    await refreshOrder();
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
  // active === false items are soft-removed (see
  // scripts/add-orders-item-active-column.sql) — shown struck-through with
  // a 0 sum in the table below, excluded from the real total here.
  const activeItems = (order.items ?? []).filter((i: { active?: boolean }) => i.active !== false);
  const orderTotal  = activeItems.reduce(
    (s: number, i: { price: number; quantity: number }) => s + i.price * i.quantity, 0
  );
  const currentPipe = PIPELINE[Math.max(0, step)];
  const npParsed    = order.addr_delivery ? parseNpAddress(order.addr_delivery) : null;
  const isPostomat  = npParsed?.isPostomat ?? false;

  // Any in-flight write/API call blocks the whole page — deliberately
  // excludes itemSearching, which fires on every keystroke of the live
  // product search and already has its own small inline spinner.
  const isBusy =
    saving || processing || confirming || checkingNp || cancellingTtn ||
    postomatSubmitting || codLoadingPreview || codSubmitting ||
    savingPrepayment || generatingInvoice || generatingTtn || stockChecking ||
    emailPreviewLoading || emailSending || savingClient || submittingReturn ||
    npManualSubmitting ||
    savingItemId !== null;

  return (
    <>
      <Header
        title={
          <>
            <span className="sm:hidden">#{order.id}</span>
            <span className="hidden sm:inline">Замовлення #{order.id}</span>
          </>
        }
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push(`/orders/${params.id}/viber-messages`)}
            style={{ gap: 6, borderColor: "#7360f255", color: "#8f5db7" }}
          >
            <MessageCircle size={14} />
            <span className="hidden sm:inline">Viber</span>
          </Button>
        }
      />
      {isBusy && <BusyOverlay />}
      <div className="p-4 md:p-6 space-y-5 max-w-5xl">

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
            <CardContent className="px-2 pt-4 pb-4 sm:px-5 sm:pt-6 sm:pb-5">
              {/* Sized to genuinely fit all 4 steps on a 375px phone
                  (iPhone SE) without scrolling — smaller circle, column
                  width and font below `sm`, verified live. overflow-x:auto
                  stays only as a safety net for anything even narrower. */}
              <div style={{ display: "flex", alignItems: "flex-start", overflowX: "auto" }}>
                {PIPELINE.flatMap((p, i) => {
                  const isDone   = step > i;
                  const isActive = step === i;
                  const isFuture = step < i;

                  const circle = (
                    <div key={p.status} className="w-[68px] sm:w-[84px]" style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
                      <div
                        className="w-9 h-9 sm:w-11 sm:h-11"
                        style={{
                          borderRadius: "50%",
                          background: isDone || isActive ? p.color : "transparent",
                          border: isFuture ? "2px dashed #cbd5e1" : `2px solid ${p.color}`,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          color: isDone || isActive ? "#fff" : "#94a3b8",
                          fontWeight: 700, fontSize: 15,
                          boxShadow: isActive ? `0 0 0 5px ${p.color}28, 0 0 0 10px ${p.color}0f` : "none",
                          transition: "all 0.3s ease",
                          flexShrink: 0,
                        }}
                      >
                        {isDone ? <Check size={18} strokeWidth={3} /> : <span>{i + 1}</span>}
                      </div>
                      {/* overflowWrap:break-word as a safety net only —
                          columns are sized so labels fit on one line at
                          both breakpoints, but this stops any bleed into
                          the next step if a label ever runs long. */}
                      <div
                        className="text-[9.5px] sm:text-[11.5px]"
                        style={{
                          marginTop: 7, textAlign: "center", lineHeight: 1.2, width: "100%",
                          fontWeight: isActive ? 700 : isDone ? 600 : 400,
                          color: isFuture ? "var(--text-muted)" : "var(--text)",
                          overflowWrap: "break-word",
                        }}
                      >{p.label}</div>
                      <div
                        className="text-[8.5px] sm:text-[10px]"
                        style={{
                          color: "var(--text-muted)", textAlign: "center",
                          width: "100%", lineHeight: 1.25, marginTop: 2,
                          overflowWrap: "break-word",
                        }}
                      >{p.sublabel}</div>
                    </div>
                  );

                  const connector = i < PIPELINE.length - 1 ? (
                    <div
                      key={`line-${i}`}
                      className="mt-[15px] sm:mt-[19px]"
                      style={{
                        flex: 1, height: 3, borderRadius: 2,
                        background: isDone
                          ? `linear-gradient(to right, ${p.color}, ${PIPELINE[i + 1].color})`
                          : "var(--border)",
                        transition: "background 0.5s ease",
                      }}
                    />
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
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <FileText size={14} color="var(--text-muted)" />
                        <span style={{ fontSize: 13 }}>Рахунок: <strong>{order.doc_field_1}</strong></span>
                      </div>
                      {/* grid-cols-3 on phone — three equal-width buttons on
                          their own row, instead of squeezing into the label
                          row above (or wrapping unevenly). Back to a plain
                          inline row from `sm` up. */}
                      <div className="grid grid-cols-3 sm:flex" style={{ gap: 8 }}>
                        <button
                          onClick={() => window.open(`/api/orders/${params.id}/invoice`, "_blank")}
                          className="w-full sm:w-auto"
                          style={{ padding: "5px 12px", borderRadius: 6, fontSize: 12, fontWeight: 600, textAlign: "center", background: "rgba(99,102,241,0.12)", color: "#6366f1", border: "1px solid rgba(99,102,241,0.22)", cursor: "pointer" }}
                        >
                          Рахунок
                        </button>
                        <button
                          onClick={() => window.open(`/api/orders/${params.id}/waybill`, "_blank")}
                          className="w-full sm:w-auto"
                          style={{ padding: "5px 12px", borderRadius: 6, fontSize: 12, fontWeight: 600, textAlign: "center", background: "rgba(16,185,129,0.12)", color: "#059669", border: "1px solid rgba(16,185,129,0.22)", cursor: "pointer" }}
                        >
                          Видаткова
                        </button>
                        <button
                          onClick={() => window.open(`/api/orders/${params.id}/receipt`, "_blank")}
                          className="w-full sm:w-auto"
                          style={{ padding: "5px 12px", borderRadius: 6, fontSize: 12, fontWeight: 600, textAlign: "center", background: "rgba(245,158,11,0.12)", color: "#d97706", border: "1px solid rgba(245,158,11,0.22)", cursor: "pointer" }}
                        >
                          Накладна
                        </button>
                      </div>
                    </div>
                  )}
                  {order.doc_field_1 && (
                    // Blocked off like the prepayment card below, instead
                    // of one cramped row — label/input/%/button now have
                    // room to breathe, and the button goes full-width on
                    // phone.
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "10px 12px", borderRadius: 8, background: "var(--bg)", border: "1px solid var(--border)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 12.5, color: "var(--text-muted)", flexShrink: 0 }}>Знижка клієнта:</span>
                        <Input
                          type="number" min={0} max={100} step="0.1"
                          value={discountInput}
                          onChange={(e) => setDiscountInput(e.target.value)}
                          style={{ width: 70, height: 28, fontSize: 12.5, flexShrink: 0 }}
                        />
                        <span style={{ fontSize: 12.5, color: "var(--text-muted)" }}>%</span>
                      </div>
                      <button
                        onClick={resendWithDiscount}
                        disabled={resendingDiscount}
                        className="w-full sm:w-auto"
                        style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "6px 12px", borderRadius: 6, fontSize: 12, fontWeight: 600, background: "rgba(99,102,241,0.12)", color: "#6366f1", border: "1px solid rgba(99,102,241,0.22)", cursor: "pointer" }}
                        title="Перерахувати ціни за новою знижкою і надіслати рахунок та накладну зі знижкою повторно"
                      >
                        {resendingDiscount ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail size={12} />}
                        Змінити і надіслати повторно
                      </button>
                    </div>
                  )}
                  {/* Postomat orders confirm payment here too — /api/orders/[id]/confirm-payment
                      already skips TTN creation for a postomat address (via skipPostomat)
                      but still sends the thank-you email and advances status to "Оплачено"
                      unconditionally, so this is the same button/action either way. The
                      postomat-specific TTN (with parcel dimensions) is a distinct action,
                      offered only once payment is confirmed — see Step 1 below. Cash-on-
                      delivery isn't offered for postomat destinations (NP doesn't support it
                      there — release is prepayment-only). */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <div className="flex-col sm:flex-row" style={{ display: "flex", alignItems: "stretch", gap: 10 }}>
                      <Button
                        onClick={confirmPayment} disabled={confirming}
                        className="w-full sm:w-auto"
                        style={{ background: "linear-gradient(135deg,#3b82f6,#2563eb)", border: "none", color: "#fff", gap: 8, height: 42, fontSize: 14 }}
                      >
                        {confirming ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard size={16} />}
                        Підтвердити оплату
                      </Button>
                      {!isPostomat && (
                        <Button
                          onClick={openCodDialog}
                          className="w-full sm:w-auto"
                          style={{ background: NP_RED, border: "none", color: "#fff", gap: 8, height: 42, fontSize: 14 }}
                        >
                          <Banknote size={16} />
                          Відправити накладеним платежем
                        </Button>
                      )}
                      <Button variant="outline" onClick={openManualPanel} className="w-full sm:w-auto" style={{ gap: 8, height: 42, fontSize: 14 }}>
                        <SlidersHorizontal size={14} /> Ручне керування
                      </Button>
                    </div>
                    <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>
                      {isPostomat
                        ? "Поштомат — це лише підтвердить оплату; ТТН і габарити посилки вводяться окремо на наступному кроці. Накладений платіж тут неможливий (видача лише після повної передоплати)."
                        : `Оплата вже надійшла (переказ) — автоматично створить ТТН. Або накладений платіж — отримувач сплачує ${Math.max(0, orderTotal - (parseFloat(prepaymentInput) || 0)).toFixed(2)} грн при отриманні.`}
                    </p>
                    {!isPostomat && (
                      // Stacked, blocked-off card on mobile instead of a
                      // cramped single row — label + number input + save
                      // button don't fit one 375px line.
                      <div
                        className="flex-col sm:flex-row sm:items-center"
                        style={{ display: "flex", gap: 8, padding: "10px 12px", borderRadius: 8, background: "var(--bg)", border: "1px solid var(--border)" }}
                      >
                        <Label style={{ fontSize: 12, color: "var(--text-muted)" }}>Врахувати передоплату, грн</Label>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
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
                    )}
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
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <Package size={14} color="var(--text-muted)" />
                      <span style={{ fontSize: 13 }}>ТТН: <strong className="font-mono">{order.ttn}</strong></span>
                      <a
                        href={`https://novaposhta.ua/tracking/${order.ttn}`}
                        target="_blank" rel="noreferrer"
                        style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 10px", borderRadius: 6, fontSize: 12, fontWeight: 600, background: "#e4032e18", color: "#e4032e", border: "1px solid #e4032e40", textDecoration: "none" }}
                      >
                        <Truck size={11} /> Відстежити
                      </a>
                      {order.ttn_auto_created && (
                        <button
                          onClick={() => setShowCancelTtnDialog(true)}
                          style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "none", border: "none", cursor: "pointer", color: "#dc2626", fontSize: 12, padding: 0 }}
                        >
                          <XCircle size={11} /> Скасувати
                        </button>
                      )}
                    </div>
                  ) : isPostomat ? (
                    /* Поштомат: оплату вже підтверджено на попередньому
                       кроці (без створення ТТН — skipPostomat) — тут єдина
                       дія: ввести габарити посилки й створити ТТН. */
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                        <Button
                          onClick={() => setShowPostomatDialog(true)}
                          style={{ background: NP_RED, border: "none", color: "#fff", gap: 8, height: 42, fontSize: 14 }}
                        >
                          <PackageSearch size={16} />
                          Відправити на поштомат
                        </Button>
                        <Button variant="outline" onClick={openManualPanel} style={{ gap: 8, height: 42, fontSize: 14 }}>
                          <SlidersHorizontal size={14} /> Ручне керування
                        </Button>
                      </div>
                      <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>
                        Поштомат — видача лише після повної передоплати.
                      </p>
                    </div>
                  ) : (
                    /* TTN відсутній — можна спробувати згенерувати автоматично ще раз, або ввести вручну */
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <Button
                            onClick={generateTtnManually} disabled={generatingTtn}
                            style={{ background: NP_RED, border: "none", color: "#fff", gap: 8 }}
                          >
                            {generatingTtn ? <Loader2 className="h-4 w-4 animate-spin" /> : <Truck size={15} />}
                            {ttnGenError ? "Спробувати ще раз" : "Згенерувати ТТН автоматично"}
                          </Button>
                          {ttnGenError && (
                            <Button
                              onClick={openNpManualDialog}
                              style={{ background: NP_RED, border: "none", color: "#fff", gap: 8 }}
                            >
                              <MapPin size={15} /> Обрати вручну
                            </Button>
                          )}
                          <Button variant="outline" onClick={openManualPanel} style={{ gap: 8 }}>
                            <SlidersHorizontal size={14} /> Ручне керування
                          </Button>
                        </div>
                        {ttnGenError && (
                          <>
                            <span style={{ fontSize: 12, color: "#dc2626", display: "flex", alignItems: "center", gap: 4 }}>
                              <XCircle size={12} /> {ttnGenError}
                            </span>
                            {/* ТТН не вдалось створити автоматично — лист-подяка з
                                номером ТТН теж не пішов (див. confirm-payment/route.ts).
                                Поки клієнт не отримав жодного листа, дозволяємо
                                надіслати той самий лист без номера ТТН вручну. */}
                            <Button
                              variant="outline" onClick={() => openEmailPreview("confirmed")}
                              style={{ gap: 8, alignSelf: "flex-start" }}
                            >
                              <Mail size={14} /> Надіслати повідомлення про оплату без ТТН
                            </Button>
                          </>
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
                    <div className="flex-col sm:flex-row" style={{ display: "flex", alignItems: "stretch", gap: 10 }}>
                      <Button
                        onClick={() => advanceStatus("Відправлено")}
                        className="w-full sm:w-auto"
                        style={{ background: "linear-gradient(135deg,#8b5cf6,#7c3aed)", border: "none", color: "#fff", gap: 8, height: 42, fontSize: 14 }}
                      >
                        <Truck size={16} />
                        Позначити відправленим
                      </Button>
                      <Button variant="outline" onClick={openManualPanel} className="w-full sm:w-auto" style={{ gap: 8, height: 42, fontSize: 14 }}>
                        <SlidersHorizontal size={14} /> Ручне керування
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
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <Package size={14} color="var(--text-muted)" />
                      <span style={{ fontSize: 13 }}>ТТН: <strong className="font-mono">{order.ttn}</strong></span>
                      <a
                        href={`https://novaposhta.ua/tracking/${order.ttn}`}
                        target="_blank" rel="noreferrer"
                        style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 10px", borderRadius: 6, fontSize: 12, fontWeight: 600, background: "#e4032e18", color: "#e4032e", border: "1px solid #e4032e40", textDecoration: "none" }}
                      >
                        <Truck size={11} /> Відстежити
                      </a>
                    </div>
                  )}
                  <div className="flex-col sm:flex-row" style={{ display: "flex", gap: 10, alignItems: "stretch" }}>
                    <Button
                      onClick={() => advanceStatus("Завершено")}
                      className="w-full sm:w-auto"
                      style={{ background: "linear-gradient(135deg,#10b981,#059669)", border: "none", color: "#fff", gap: 8, height: 42, fontSize: 14 }}
                    >
                      <MapPin size={16} />
                      Позначити отриманим / завершити
                    </Button>
                    <Button
                      onClick={checkNpStatus} disabled={checkingNp}
                      className="w-full sm:w-auto"
                      style={{ background: NP_RED, border: "none", color: "#fff", gap: 8, height: 42, fontSize: 14 }}
                    >
                      {checkingNp ? <Loader2 className="h-4 w-4 animate-spin" /> : <Truck size={16} />}
                      Перевірити статус НП
                    </Button>
                    <Button variant="outline" onClick={openManualPanel} className="w-full sm:w-auto" style={{ gap: 8, height: 42, fontSize: 14 }}>
                      <SlidersHorizontal size={14} /> Ручне керування
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

            </CardContent>
          </Card>
        )}

        {/* ── WAREHOUSE STOCK-CONFIRMATION POPUP ─────────────────────────── */}
        <Dialog open={showStockConfirm} onOpenChange={setShowStockConfirm}>
          {/* This popup's content (item checklist + add-item + discount +
              supplier picker + footer buttons) is taller than a phone
              viewport. The base DialogContent vertically centers with no
              height cap, so on mobile it overflowed both above and below
              the screen with no way to scroll down to the confirm button.
              Below `sm` it's anchored near the top with its own capped,
              scrollable height instead; at `sm` and up every value is
              reasserted back to the component's original centered,
              uncapped layout — desktop is unchanged.
              `dvh` not `vh` for the cap — mobile Safari/Chrome report `vh`
              against the LARGEST viewport (address bar hidden), so a cap
              sized in `vh` sat partly behind the address bar whenever it
              was showing: the dialog's own bottom edge (and the confirm
              button right above it) ended up below the real visible area,
              and since the page behind a modal can't be scrolled, that
              sliver was permanently unreachable no matter how far the
              dialog's internal content was scrolled. `dvh` tracks the
              actual visible viewport as the address bar shows/hides. */}
          <DialogContent
            style={{ maxWidth: 680 }}
            className="top-4 translate-y-0 max-h-[calc(100dvh-2rem)] overflow-y-auto sm:top-[50%] sm:translate-y-[-50%] sm:max-h-none sm:overflow-visible"
          >
            <DialogHeader>
              <DialogTitle style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Package size={16} /> Перевірка наявності на складі
              </DialogTitle>
            </DialogHeader>
            <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "-4px 0 4px" }}>
              Позначте кожен товар, переконавшись, що він фізично є на складі, перед формуванням рахунку та відправкою листа клієнту.
            </p>
            {/* Removed lines (see scripts/add-orders-item-active-column.sql)
                have nothing to physically check — they're excluded from
                this whole checklist, not just hidden. */}
            {!!activeItems.length && (
              <label
                style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "8px 10px",
                  borderRadius: 8, border: "1px dashed var(--border)", cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={activeItems.every((i: { id: number }) => stockChecks[i.id])}
                  ref={(el) => {
                    if (el) el.indeterminate = activeItems.some((i: { id: number }) => stockChecks[i.id]) && !activeItems.every((i: { id: number }) => stockChecks[i.id]);
                  }}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setStockChecks(Object.fromEntries(activeItems.map((i: { id: number }) => [i.id, checked])));
                  }}
                  style={{ width: 17, height: 17, flexShrink: 0, cursor: "pointer" }}
                />
                <span style={{ fontSize: 13, fontWeight: 500 }}>Вибрати всі товари</span>
              </label>
            )}
            <div style={{ maxHeight: 340, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {activeItems.map((item: any) => (
                <div
                  key={item.id}
                  // Stacked on mobile (checkbox+photo+title on their own
                  // line, qty/remove below) — at the fixed single-row width
                  // this had before, the title's flex:1 share shrank to
                  // ~100px on a phone and wrapped one word per line. `sm:`
                  // restores the exact original single-row layout.
                  className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-2.5"
                  style={{
                    padding: "8px 10px",
                    borderRadius: 8, border: "1px solid var(--border)",
                    background: stockChecks[item.id] ? "rgba(16,185,129,0.08)" : "transparent",
                  }}
                >
                  <label className="flex items-center gap-2.5 flex-1 min-w-0" style={{ cursor: "pointer" }}>
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
                      {item.productUrl ? (
                        <a
                          href={item.productUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          style={{ fontSize: 13, fontWeight: 500, color: "inherit", textDecoration: "none" }}
                          onMouseEnter={(e) => (e.currentTarget.style.textDecoration = "underline")}
                          onMouseLeave={(e) => (e.currentTarget.style.textDecoration = "none")}
                        >
                          {item.productTitle ?? `Товар #${item.product}`}
                        </a>
                      ) : (
                        <div style={{ fontSize: 13, fontWeight: 500 }}>
                          {item.productTitle ?? `Товар #${item.product}`}
                        </div>
                      )}
                      {item.productPcode && (
                        <div className="font-mono" style={{ fontSize: 11, color: "var(--text-muted)" }}>
                          {item.productPcode}
                        </div>
                      )}
                    </div>
                  </label>
                  {/* Self-saving on blur (see saveItemQuantity) — this
                      popup has no per-row "Save" button the way the main
                      table's editingItems mode does. Outside the <label>
                      on purpose, alongside the remove button, so a click
                      here never risks also toggling the checkbox.
                      `sm:contents` unwraps this div at `sm`+ so Input/span/
                      button become direct flex children of the row again —
                      identical desktop DOM/spacing to before; below `sm` it
                      stays a real row, the stacked 2nd line under the label. */}
                  <div className="flex items-center gap-2 sm:contents">
                    <Input
                      type="number" min={1} step="1"
                      defaultValue={item.quantity}
                      key={`${item.id}-${item.quantity}`}
                      onBlur={(e) => { if (e.target.value !== String(item.quantity)) saveItemQuantity(item.id, e.target.value); }}
                      disabled={savingItemId === item.id}
                      style={{ width: 60, flexShrink: 0, textAlign: "right", height: 32 }}
                      title="Кількість"
                    />
                    <span style={{ flexShrink: 0, fontSize: 11.5, color: "var(--text-muted)" }}>шт</span>
                    <button
                      onClick={() => setRemoveItemConfirm({ id: item.id, title: item.productTitle ?? `Товар #${item.product}` })}
                      disabled={savingItemId === item.id}
                      style={{ flexShrink: 0, padding: 5, borderRadius: 6, background: "rgba(220,38,38,0.1)", color: "#dc2626", border: "none", cursor: "pointer", display: "flex" }}
                      title="Прибрати з замовлення"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {!showAddItem ? (
              <button
                onClick={() => { setShowAddItem(true); setEditingItems(true); }}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  width: "100%", padding: "10px", borderRadius: 8,
                  border: "2px dashed var(--border)", background: "transparent",
                  color: "var(--text-muted)", cursor: "pointer", fontSize: 13, fontWeight: 600,
                }}
              >
                <Plus size={15} /> Додати товар
              </button>
            ) : (
              <div style={{ position: "relative" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Search size={14} color="var(--text-muted)" style={{ flexShrink: 0 }} />
                  <Input
                    autoFocus
                    value={itemSearch}
                    onChange={(e) => searchProducts(e.target.value)}
                    placeholder="Пошук товару за назвою або артикулом…"
                  />
                  {itemSearching && <Loader2 className="h-4 w-4 animate-spin" style={{ flexShrink: 0 }} />}
                  <button
                    onClick={() => { setShowAddItem(false); setItemSearch(""); setItemSearchResults([]); }}
                    style={{ flexShrink: 0, background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", display: "flex", padding: 4 }}
                    title="Закрити"
                  >
                    <X size={16} />
                  </button>
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
            <label
              style={{
                display: "flex", alignItems: "center", gap: 10, padding: "8px 10px",
                borderRadius: 8, border: "1px solid var(--border)", cursor: "pointer",
                background: isOversized ? "rgba(245,158,11,0.08)" : "transparent",
              }}
            >
              <input
                type="checkbox"
                checked={isOversized}
                onChange={(e) => setIsOversized(e.target.checked)}
                style={{ width: 17, height: 17, flexShrink: 0, cursor: "pointer" }}
              />
              <div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>Товари габаритні</div>
                <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
                  ТТН буде сформовано з відділення для габаритних відправлень (№18) замість основного (№100)
                </div>
              </div>
            </label>
            <div className="space-y-1.5">
              <Label style={{ fontSize: 13, fontWeight: 500 }}>Знижка клієнта, %</Label>
              <Input
                type="number" min={0} max={100} step="0.1"
                value={discountInput}
                onChange={(e) => setDiscountInput(e.target.value)}
                style={{ width: 100 }}
              />
              <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
                За замовчуванням — знижка групи клієнта ({order.clientDiscountPercent ?? 5}%, за рангом клієнта). Тут можна вказати іншу для цього замовлення — застосується до ціни кожного товару.
              </div>
            </div>
            <div className="space-y-1.5">
              <Label style={{ fontSize: 13, fontWeight: 500 }}>Постачальник для рахунку</Label>
              <Select value={supplierOverride} onValueChange={(v) => setSupplierOverride(v as "auto" | "1" | "2")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Автоматично (за налаштуваннями)</SelectItem>
                  <SelectItem value="1">Постачальник 1{supplierNames[1] ? ` (${supplierNames[1]})` : ""}</SelectItem>
                  <SelectItem value="2">Постачальник 2{supplierNames[2] ? ` (${supplierNames[2]})` : ""}</SelectItem>
                </SelectContent>
              </Select>
              <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
                За замовчуванням постачальник обирається автоматично за сумою замовлення й порогом у налаштуваннях — тут можна змінити лише для цього конкретного замовлення.
              </div>
            </div>
            <div className="flex flex-col sm:flex-row sm:justify-end gap-2.5 mt-1">
              <Button variant="outline" className="w-full sm:w-auto" onClick={() => setShowStockConfirm(false)}>Скасувати</Button>
              <Button
                className="w-full sm:w-auto"
                onClick={confirmStockAndProcess}
                disabled={!activeItems.length || !activeItems.every((i: { id: number }) => stockChecks[i.id])}
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
              <DialogTitle style={{ display: "flex", alignItems: "center", gap: 8, color: "#e4032e" }}>
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
                  style={{ background: NP_RED, border: "none", color: "#fff", gap: 8 }}
                >
                  {postomatSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackageSearch size={15} />}
                  Створити ТТН
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* ── MANUAL NOVA POSHTA CITY/WAREHOUSE PICKER ────────────────────
            Escape hatch for when the order's free-text delivery address
            can't be parsed (or the city/warehouse it names isn't found in
            NP) — search Nova Poshta's own city/warehouse API instead of
            fixing the address text, then create the TTN with those refs. */}
        <Dialog open={showNpManualDialog} onOpenChange={setShowNpManualDialog}>
          <DialogContent style={{ maxWidth: 460 }}>
            <DialogHeader>
              <DialogTitle style={{ display: "flex", alignItems: "center", gap: 8, color: "#e4032e" }}>
                <MapPin size={16} /> Обрати місто/відділення вручну
              </DialogTitle>
            </DialogHeader>
            <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "-4px 0 4px" }}>
              Пошук напряму в Новій Пошті — на випадок, коли адресу доставки не вдалося розпізнати автоматично.
            </p>

            <div className="space-y-1.5">
              <Label>Місто</Label>
              {npCitySelected ? (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "8px 12px", borderRadius: 8, background: "var(--bg)", fontSize: 13 }}>
                  <span>{npCitySelected.description}</span>
                  <button
                    onClick={() => { setNpCitySelected(null); setNpWhSelected(null); setNpCityQuery(""); }}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)" }}
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <>
                  <Input
                    value={npCityQuery}
                    onChange={(e) => setNpCityQuery(e.target.value)}
                    placeholder="Почніть вводити назву міста..."
                  />
                  {npCitySearching && <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>Пошук...</div>}
                  {npCityQuery.trim().length >= 2 && npCityResults.length > 0 && (
                    <div style={{ marginTop: 4, maxHeight: 160, overflowY: "auto", border: "1px solid var(--border)", borderRadius: 8 }}>
                      {npCityResults.map((c) => (
                        <button
                          key={c.ref}
                          onClick={() => { setNpCitySelected(c); setNpCityResults([]); }}
                          style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 12px", background: "none", border: "none", cursor: "pointer", fontSize: 13 }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover)")}
                          onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                        >
                          {c.description}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            {npCitySelected && (
              <div className="space-y-1.5">
                <Label>Відділення або поштомат</Label>
                {npWhSelected ? (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "8px 12px", borderRadius: 8, background: "var(--bg)", fontSize: 13 }}>
                    <span>{npWhSelected.description}</span>
                    <button
                      onClick={() => setNpWhSelected(null)}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)" }}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <>
                    <Input
                      value={npWhQuery}
                      onChange={(e) => setNpWhQuery(e.target.value)}
                      placeholder="Номер або назва (необов'язково)..."
                    />
                    {npWhSearching && <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>Пошук...</div>}
                    {npWhResults.length > 0 && (
                      <div style={{ marginTop: 4, maxHeight: 200, overflowY: "auto", border: "1px solid var(--border)", borderRadius: 8 }}>
                        {npWhResults.map((w) => (
                          <button
                            key={w.ref}
                            onClick={() => setNpWhSelected(w)}
                            style={{ display: "flex", alignItems: "center", gap: 6, width: "100%", textAlign: "left", padding: "8px 12px", background: "none", border: "none", cursor: "pointer", fontSize: 12.5 }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover)")}
                            onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                          >
                            {w.isPostomat ? <PackageSearch size={13} style={{ flexShrink: 0 }} /> : <Package size={13} style={{ flexShrink: 0 }} />}
                            {w.description}
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {npWhSelected?.isPostomat && (
              <div className="space-y-1.5">
                <Label style={{ fontSize: 12.5 }}>Габарити посилки — Нова Пошта вимагає їх для поштоматів</Label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div className="space-y-1.5">
                    <Label style={{ fontSize: 12 }}>Вага, кг</Label>
                    <Input type="number" step="0.1" min="0.1" value={npManualSeat.weight}
                      onChange={(e) => setNpManualSeat((p) => ({ ...p, weight: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label style={{ fontSize: 12 }}>Довжина, см</Label>
                    <Input type="number" step="1" min="1" value={npManualSeat.length}
                      onChange={(e) => setNpManualSeat((p) => ({ ...p, length: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label style={{ fontSize: 12 }}>Ширина, см</Label>
                    <Input type="number" step="1" min="1" value={npManualSeat.width}
                      onChange={(e) => setNpManualSeat((p) => ({ ...p, width: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label style={{ fontSize: 12 }}>Висота, см</Label>
                    <Input type="number" step="1" min="1" value={npManualSeat.height}
                      onChange={(e) => setNpManualSeat((p) => ({ ...p, height: e.target.value }))} />
                  </div>
                </div>
              </div>
            )}

            {npManualError && (
              <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "10px 14px", borderRadius: 10, background: "rgba(239,68,68,0.1)" }}>
                <XCircle size={16} color="#dc2626" style={{ flexShrink: 0, marginTop: 1 }} />
                <span style={{ fontSize: 13, color: "#dc2626" }}>{npManualError}</span>
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 4 }}>
              <Button variant="outline" onClick={() => setShowNpManualDialog(false)}>Скасувати</Button>
              <Button
                onClick={submitNpManual} disabled={npManualSubmitting || !npCitySelected || !npWhSelected}
                style={{ background: NP_RED, border: "none", color: "#fff", gap: 8 }}
              >
                {npManualSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Truck size={15} />}
                Створити ТТН
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* ── CASH ON DELIVERY (НАКЛАДЕНИЙ ПЛАТІЖ) ───────────────────────── */}
        <Dialog open={showCodDialog} onOpenChange={setShowCodDialog}>
          <DialogContent style={{ maxWidth: 460 }}>
            <DialogHeader>
              <DialogTitle style={{ display: "flex", alignItems: "center", gap: 8, color: "#e4032e" }}>
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
                  <div><span style={{ color: "var(--text-muted)" }}>Розміри (орієнтовно):</span> {String(codPreview.length)}×{String(codPreview.width)}×{String(codPreview.height)} см</div>
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
                      style={{ background: NP_RED, border: "none", color: "#fff", gap: 8 }}
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
                ) : isPostomat ? (
                  /* Поштомат — лише один шлях, той самий, що на кроці
                     "В роботі"/"Оплачено": звичайне "Згенерувати" тут
                     завжди відмовить (skipPostomat), тому не показуємо
                     його поруч. */
                  <Button
                    size="sm" onClick={() => { setShowManualPanel(false); setShowPostomatDialog(true); }}
                    style={{ background: NP_RED, border: "none", color: "#fff", gap: 6 }}
                  >
                    <PackageSearch size={13} /> На поштомат
                  </Button>
                ) : (
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    <Button size="sm" onClick={generateTtnManually} disabled={generatingTtn} style={{ background: NP_RED, border: "none", color: "#fff" }}>
                      {ttnGenError ? "Перегенерувати" : "Згенерувати"}
                    </Button>
                    {ttnGenError && (
                      <Button
                        size="sm" onClick={() => { setShowManualPanel(false); openNpManualDialog(); }}
                        style={{ background: NP_RED, border: "none", color: "#fff" }}
                      >
                        <MapPin size={13} /> Вручну
                      </Button>
                    )}
                  </div>
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
                <Mail size={16} /> {emailPreviewKind === "confirmed" ? "Лист-подяка" : emailPreviewKind === "welcome" ? "Вітальне повідомлення" : "Рахунок клієнту"} — перегляд перед надсиланням
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
                <div className="flex-col sm:flex-row" style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flexWrap: "wrap" }}>
                    <span style={{ color: "var(--text-muted)", flexShrink: 0 }}>Адреса:</span>
                    <strong style={{ overflowWrap: "break-word", minWidth: 0 }}>{resendEmail || "не вказано"}</strong>
                  </div>
                  <button
                    onClick={() => setEditingResendEmail(true)}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "var(--accent)", display: "flex", alignItems: "center", gap: 4, fontSize: 12, padding: 0, flexShrink: 0 }}
                  >
                    <Pencil size={12} /> Змінити
                  </button>
                </div>
              )}

              {/* whitespace-normal/text-left/h-auto override the shared
                  Button's default whitespace-nowrap+fixed height — these
                  labels are long sentences, not short button text, and
                  nowrap forced each one wider than a phone screen (818px
                  overflow measured live on 375px iPhone SE before this). */}
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <Button
                  variant="outline" size="sm" onClick={() => openEmailPreview("welcome")}
                  className="whitespace-normal text-left h-auto py-2"
                  style={{ flex: "1 1 220px" }}
                >
                  <Mail size={14} color={order.welcome_email_sent_at ? "#059669" : undefined} style={{ flexShrink: 0 }} />
                  {order.welcome_email_sent_at ? "Вітальне повідомлення — переглянути / надіслати повторно" : "Вітальне повідомлення — переглянути й надіслати"}
                </Button>
                <Button
                  variant="outline" size="sm" onClick={() => openEmailPreview("invoice")}
                  className="whitespace-normal text-left h-auto py-2"
                  style={{ flex: "1 1 220px" }}
                >
                  <Mail size={14} style={{ flexShrink: 0 }} />
                  {step === -1 ? "Рахунок — переглянути й надіслати" : "Рахунок — переглянути й надіслати повторно"}
                </Button>
                {step >= 1 && (
                  <Button
                    variant="outline" size="sm" onClick={() => openEmailPreview("confirmed")}
                    className="whitespace-normal text-left h-auto py-2"
                    style={{ flex: "1 1 220px" }}
                  >
                    <Mail size={14} style={{ flexShrink: 0 }} />
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
                <div className="grid grid-cols-1 sm:flex" style={{ marginTop: 12, justifyContent: "flex-end", gap: 8 }}>
                  <button
                    onClick={() => window.open(`/api/orders/${params.id}/receipt`, "_blank")}
                    className="w-full sm:w-auto"
                    style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "8px 18px", borderRadius: 8, fontSize: 13, fontWeight: 600, background: "linear-gradient(135deg,#f59e0b,#d97706)", color: "#fff", border: "none", cursor: "pointer" }}
                  >
                    <FileText size={14} /> Накладна зі знижкою
                  </button>
                  <button
                    onClick={() => window.open(`/api/orders/${params.id}/invoice`, "_blank")}
                    className="w-full sm:w-auto"
                    style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "8px 18px", borderRadius: 8, fontSize: 13, fontWeight: 600, background: "linear-gradient(135deg,#6366f1,#8b5cf6)", color: "#fff", border: "none", cursor: "pointer" }}
                  >
                    <FileText size={14} /> Рахунок-фактура
                  </button>
                  <button
                    onClick={() => window.open(`/api/orders/${params.id}/waybill`, "_blank")}
                    className="w-full sm:w-auto"
                    style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "8px 18px", borderRadius: 8, fontSize: 13, fontWeight: 600, background: "linear-gradient(135deg,#10b981,#059669)", color: "#fff", border: "none", cursor: "pointer" }}
                  >
                    <ClipboardList size={14} /> Видаткова
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
                    {/* Search box for Nova Poshta's own city+warehouse list
                        (one field, per the ask) — picking a suggestion
                        writes the exact "{City} — {Тип} №{N}...: {адреса}"
                        format parseNpAddress() (and TTN creation
                        downstream of it) requires; typing without picking
                        one still works as plain free text, for delivery
                        addresses that aren't an NP warehouse at all. */}
                    <NpAddressPicker
                      value={clientDraft.addr_delivery}
                      onChange={(v) => setClientDraft((d) => ({ ...d, addr_delivery: v }))}
                      placeholder="напр. Рівне — Відділення №5…"
                    />
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
                    style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 10px", borderRadius: 6, fontSize: 12, fontWeight: 600, background: "#e4032e18", color: "#e4032e", border: "1px solid #e4032e40", textDecoration: "none" }}
                  >
                    <Truck size={11} /> Відстежити
                  </a>
                </div>
              )}
              {order.pay_method && <div><span className="text-gray-500">Оплата:</span> {order.pay_method}</div>}
              <div><span className="text-gray-500">Дата:</span> {formatDate(order.date)}</div>
              {order.doc_field_1 && (
                <div style={{ marginTop: 4, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
                  <div style={{ marginBottom: 8 }}>
                    <span className="text-gray-500">рахунок</span>{" "}
                    <span className="font-mono font-semibold">{order.doc_field_1}</span>
                  </div>
                  <div className="grid grid-cols-1 sm:flex" style={{ justifyContent: "flex-end", gap: 8 }}>
                    <button
                      onClick={() => window.open(`/api/orders/${params.id}/receipt`, "_blank")}
                      className="w-full sm:w-auto"
                      style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "8px 18px", borderRadius: 8, fontSize: 13, fontWeight: 600, background: "linear-gradient(135deg,#f59e0b,#d97706)", color: "#fff", border: "none", cursor: "pointer" }}
                    >
                      <FileText size={14} /> Накладна зі знижкою
                    </button>
                    <button
                      onClick={() => window.open(`/api/orders/${params.id}/invoice`, "_blank")}
                      className="w-full sm:w-auto"
                      style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "8px 18px", borderRadius: 8, fontSize: 13, fontWeight: 600, background: "linear-gradient(135deg,#6366f1,#8b5cf6)", color: "#fff", border: "none", cursor: "pointer" }}
                    >
                      <FileText size={14} /> Рахунок-фактура
                    </button>
                    <button
                      onClick={() => window.open(`/api/orders/${params.id}/waybill`, "_blank")}
                      className="w-full sm:w-auto"
                      style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "8px 18px", borderRadius: 8, fontSize: 13, fontWeight: 600, background: "linear-gradient(135deg,#10b981,#059669)", color: "#fff", border: "none", cursor: "pointer" }}
                    >
                      <ClipboardList size={14} /> Видаткова
                    </button>
                  </div>
                </div>
              )}
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
                {/* The status dot already lives inside SelectValue's own
                    rendering (one per SelectItem, so it also updates when
                    open) — a second standalone dot out here just duplicated
                    it right next to the same select. */}
                <Select value={status || "__empty__"} onValueChange={(v) => setStatus(v === "__empty__" ? "" : v)}>
                  <SelectTrigger style={{ fontWeight: 600 }}>
                    <SelectValue placeholder="Оберіть статус" />
                  </SelectTrigger>
                  <SelectContent>
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
            {/* ── Mobile cards (< md) — replaces the table entirely rather
                than just scrolling it, so every column (name, price, qty,
                sum) is fully visible without a sideways swipe. ──────── */}
            {/* display:flex lives on the inner div, not here — an inline
                style="display:..." on the same element as md:hidden always
                wins over that class's @media rule (inline styles beat any
                stylesheet rule regardless of media query), which silently
                showed these cards on desktop too alongside the table. */}
            <div className="md:hidden">
            <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: editingItems ? 0 : "0 16px 16px" }}>
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {order.items?.map((item: any) => {
                const isRemoved = item.active === false;
                return (
                  <div
                    key={item.id}
                    style={{
                      display: "flex", flexDirection: "column", gap: 8, padding: 12,
                      borderRadius: 10, border: "1px solid var(--border)",
                      opacity: isRemoved ? 0.55 : 1,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      {item.productImg ? (
                        <img
                          src={item.productImg}
                          alt=""
                          style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 6, flexShrink: 0, background: "var(--bg)", filter: isRemoved ? "grayscale(1)" : undefined }}
                        />
                      ) : (
                        <div style={{ width: 40, height: 40, borderRadius: 6, flexShrink: 0, background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <Package size={18} color="var(--text-muted)" />
                        </div>
                      )}
                      <div style={{ minWidth: 0, flex: 1 }}>
                        {item.productUrl ? (
                          <a
                            href={item.productUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ fontWeight: 500, fontSize: 13.5, color: "inherit", textDecoration: isRemoved ? "line-through" : "none" }}
                          >
                            {item.productTitle ?? `Товар #${item.product}`}
                          </a>
                        ) : (
                          <div style={{ fontWeight: 500, fontSize: 13.5, textDecoration: isRemoved ? "line-through" : "none" }}>
                            {item.productTitle ?? `Товар #${item.product}`}
                          </div>
                        )}
                        <div className="font-mono" style={{ fontSize: 11, color: "var(--text-muted)" }}>
                          {item.productPcode ? `${item.productPcode} · ` : ""}#{item.product}{item.type ? ` · ${item.type}` : ""}
                          {isRemoved && <span style={{ marginLeft: 6, color: "#dc2626", fontWeight: 600 }}>прибрано</span>}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                        {editingItems && !isRemoved && (
                          <button
                            onClick={() => saveItem(item.id)} disabled={savingItemId === item.id}
                            style={{ padding: 6, borderRadius: 6, background: "rgba(16,185,129,0.12)", color: "#059669", border: "none", cursor: "pointer", display: "flex" }}
                            title="Зберегти"
                          >
                            {savingItemId === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check size={14} />}
                          </button>
                        )}
                        {isRemoved ? (
                          <button
                            onClick={() => toggleItemActive(item.id, true)} disabled={savingItemId === item.id}
                            style={{ padding: 6, borderRadius: 6, background: "rgba(16,185,129,0.12)", color: "#059669", border: "none", cursor: "pointer", display: "flex" }}
                            title="Відновити товар"
                          >
                            {savingItemId === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw size={14} />}
                          </button>
                        ) : (
                          <button
                            onClick={() => setRemoveItemConfirm({ id: item.id, title: item.productTitle ?? `Товар #${item.product}` })}
                            disabled={savingItemId === item.id}
                            style={{ padding: 6, borderRadius: 6, background: "rgba(220,38,38,0.1)", color: "#dc2626", border: "none", cursor: "pointer", display: "flex" }}
                            title="Прибрати з замовлення"
                          >
                            <X size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                    {editingItems && !isRemoved ? (
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginBottom: 3 }}>Ціна, грн</div>
                          <Input
                            type="number" step="0.01" value={item.price}
                            onChange={(e) => updateItemField(item.id, "price", e.target.value)}
                            style={{ width: "100%" }}
                          />
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginBottom: 3 }}>К-сть</div>
                          <Input
                            type="number" step="1" value={item.quantity}
                            onChange={(e) => updateItemField(item.id, "quantity", e.target.value)}
                            style={{ width: "100%" }}
                          />
                        </div>
                        <div style={{ textAlign: "right", flexShrink: 0 }}>
                          <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginBottom: 3 }}>Сума</div>
                          <div className="font-medium">{(Number(item.price) * Number(item.quantity)).toFixed(2)} грн</div>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, textDecoration: isRemoved ? "line-through" : "none" }}>
                        <span style={{ color: "var(--text-muted)" }}>{item.price.toFixed(2)} грн × {item.quantity}</span>
                        <span className="font-medium">{isRemoved ? "0.00 грн" : `${(Number(item.price) * Number(item.quantity)).toFixed(2)} грн`}</span>
                      </div>
                    )}
                  </div>
                );
              })}
              <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 8, borderTop: "1px solid var(--border)" }}>
                <span className="font-semibold">Разом:</span>
                <span className="font-bold text-lg">{orderTotal.toFixed(2)} грн</span>
              </div>
            </div>
            </div>

            {/* ── Desktop table (>= md) ───────────────────────────────── */}
            <div className="hidden md:block" style={{ overflowX: "auto" }}>
            <table className="crm-table">
              <thead>
                <tr>
                  <th>Товар</th>
                  <th style={{ textAlign: "right" }}>Ціна</th>
                  <th style={{ textAlign: "right" }}>К-сть</th>
                  <th style={{ textAlign: "right" }}>Сума</th>
                  <th style={{ textAlign: "right" }}></th>
                </tr>
              </thead>
              <tbody>
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {order.items?.map((item: any) => {
                  // Soft-removed (see scripts/add-orders-item-active-column.sql) —
                  // still shown, just struck through with a 0 sum, per the
                  // explicit ask that removed lines stay visible in history
                  // rather than disappearing.
                  const isRemoved = item.active === false;
                  return (
                  <tr key={item.id} style={isRemoved ? { opacity: 0.55 } : undefined}>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        {item.productImg ? (
                          <img
                            src={item.productImg}
                            alt=""
                            style={{ width: 36, height: 36, objectFit: "cover", borderRadius: 6, flexShrink: 0, background: "var(--bg)", filter: isRemoved ? "grayscale(1)" : undefined }}
                          />
                        ) : (
                          <div style={{ width: 36, height: 36, borderRadius: 6, flexShrink: 0, background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <Package size={16} color="var(--text-muted)" />
                          </div>
                        )}
                        <div style={{ minWidth: 0 }}>
                          {item.productUrl ? (
                            <a
                              href={item.productUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ fontWeight: 500, color: "inherit", textDecoration: isRemoved ? "line-through" : "none" }}
                              onMouseEnter={(e) => (e.currentTarget.style.textDecoration = "underline")}
                              onMouseLeave={(e) => (e.currentTarget.style.textDecoration = isRemoved ? "line-through" : "none")}
                            >
                              {item.productTitle ?? `Товар #${item.product}`}
                            </a>
                          ) : (
                            <div style={{ fontWeight: 500, textDecoration: isRemoved ? "line-through" : "none" }}>
                              {item.productTitle ?? `Товар #${item.product}`}
                            </div>
                          )}
                          <div className="font-mono" style={{ fontSize: 11, color: "var(--text-muted)" }}>
                            {item.productPcode ? `${item.productPcode} · ` : ""}#{item.product}{item.type ? ` · ${item.type}` : ""}
                            {isRemoved && <span style={{ marginLeft: 6, color: "#dc2626", fontWeight: 600 }}>прибрано</span>}
                          </div>
                        </div>
                      </div>
                    </td>
                    {editingItems && !isRemoved ? (
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
                        <td style={{ textAlign: "right", textDecoration: isRemoved ? "line-through" : "none" }}>{item.price.toFixed(2)} грн</td>
                        <td style={{ textAlign: "right", textDecoration: isRemoved ? "line-through" : "none" }}>{item.quantity}</td>
                      </>
                    )}
                    <td className="font-medium" style={{ textAlign: "right" }}>
                      {isRemoved ? "0.00 грн" : `${(Number(item.price) * Number(item.quantity)).toFixed(2)} грн`}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
                        {editingItems && !isRemoved && (
                          <button
                            onClick={() => saveItem(item.id)} disabled={savingItemId === item.id}
                            style={{ padding: 5, borderRadius: 6, background: "rgba(16,185,129,0.12)", color: "#059669", border: "none", cursor: "pointer", display: "flex" }}
                            title="Зберегти"
                          >
                            {savingItemId === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check size={14} />}
                          </button>
                        )}
                        {isRemoved ? (
                          <button
                            onClick={() => toggleItemActive(item.id, true)} disabled={savingItemId === item.id}
                            style={{ padding: 5, borderRadius: 6, background: "rgba(16,185,129,0.12)", color: "#059669", border: "none", cursor: "pointer", display: "flex" }}
                            title="Відновити товар"
                          >
                            {savingItemId === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw size={14} />}
                          </button>
                        ) : (
                          <button
                            onClick={() => setRemoveItemConfirm({ id: item.id, title: item.productTitle ?? `Товар #${item.product}` })}
                            disabled={savingItemId === item.id}
                            style={{ padding: 5, borderRadius: 6, background: "rgba(220,38,38,0.1)", color: "#dc2626", border: "none", cursor: "pointer", display: "flex" }}
                            title="Прибрати з замовлення"
                          >
                            <X size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4} className="font-semibold" style={{ textAlign: "right", borderBottom: "none" }}>Разом:</td>
                  <td className="font-bold text-lg" style={{ textAlign: "right", borderBottom: "none" }}>{orderTotal.toFixed(2)} грн</td>
                </tr>
              </tfoot>
            </table>
            </div>

            {/* Also flips editingItems on — a new line always starts at
                quantity 1, and without edit mode already active there was
                no way to correct that right after adding without a second,
                unrelated click on "Редагувати" first.
                Own horizontal padding here regardless of editingItems —
                CardContent's own padding is 0 while not editing (the
                table/cards above compensate for that themselves), which
                otherwise left this button flush against the card's edges. */}
            <div style={{ padding: editingItems ? 0 : "0 16px 16px" }}>
            {!showAddItem ? (
              <button
                onClick={() => { setShowAddItem(true); setEditingItems(true); }}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  width: "100%", marginTop: 14, padding: "14px", borderRadius: 10,
                  border: "2px dashed var(--border)", background: "transparent",
                  color: "var(--text-muted)", cursor: "pointer", fontSize: 13, fontWeight: 600,
                }}
              >
                <Plus size={16} /> Додати товар до замовлення
              </button>
            ) : (
              <div style={{ marginTop: 14, position: "relative" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Search size={14} color="var(--text-muted)" style={{ flexShrink: 0 }} />
                  <Input
                    autoFocus
                    value={itemSearch}
                    onChange={(e) => searchProducts(e.target.value)}
                    placeholder="Пошук товару за назвою або артикулом, щоб додати рядок…"
                  />
                  {itemSearching && <Loader2 className="h-4 w-4 animate-spin" style={{ flexShrink: 0 }} />}
                  <button
                    onClick={() => { setShowAddItem(false); setItemSearch(""); setItemSearchResults([]); }}
                    style={{ flexShrink: 0, background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", display: "flex", padding: 4 }}
                    title="Закрити"
                  >
                    <X size={16} />
                  </button>
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
            </div>
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

            <div
              className="flex-col sm:flex-row sm:items-end"
              style={{ display: "flex", gap: 8, flexWrap: "wrap", paddingTop: 8, borderTop: "1px solid var(--border)" }}
            >
              {/* flex-basis/grow/shrink are Tailwind classes (sm: only),
                  not inline — the parent switches to flex-direction:column
                  on phone (flex-col above), where the main axis is
                  vertical, so an inline flex:"1 1 200px" here meant *200px
                  of height*, not width, leaving a huge empty gap below a
                  36px-tall closed select (confirmed live: 293×200 measured
                  for this wrapper with nothing in it but a one-line label
                  + select). Below `sm` this now just sizes to its content,
                  which is exactly what a stacked mobile layout needs. */}
              <div className="space-y-1 sm:flex-1 sm:basis-[200px] sm:min-w-0">
                <Label style={{ fontSize: 12 }}>Товар</Label>
                {/* A native <select>'s open dropdown is sized by the OS/
                    browser itself to fit its widest <option> text,
                    ignoring the select's own CSS width entirely — no
                    amount of styling the closed element fixes that
                    (confirmed live: the popup rendered ~2x the screen
                    width on a phone even after this select itself was
                    constrained to 100%). Radix's own Select doesn't have
                    that native-popup problem — its content is a normal,
                    CSS-styled div pinned to the trigger's own width (see
                    SelectContent's w-full min-w-[var(--radix-select-trigger-width)]
                    in components/ui/select.tsx), same component already
                    used for "Статус" above. */}
                <Select
                  value={returnProduct || "__empty__"}
                  onValueChange={(v) => setReturnProduct(v === "__empty__" ? "" : v)}
                >
                  <SelectTrigger style={{ height: 36 }}>
                    <SelectValue placeholder="Оберіть товар…" />
                  </SelectTrigger>
                  <SelectContent>
                    {/* Removed lines are excluded — a return only makes
                        sense for something that was actually shipped. */}
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    {activeItems.map((item: any) => (
                      <SelectItem key={item.id} value={String(item.product)}>
                        {item.productTitle ?? `Товар #${item.product}`} (замовлено {item.quantity})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1 w-full sm:w-auto">
                <Label style={{ fontSize: 12 }}>К-сть</Label>
                <Input type="number" min={1} value={returnQty} onChange={(e) => setReturnQty(e.target.value)} className="w-full sm:w-20" />
              </div>
              <div className="space-y-1" style={{ flex: 1, minWidth: 160 }}>
                <Label style={{ fontSize: 12 }}>Причина</Label>
                <Input value={returnReason} onChange={(e) => setReturnReason(e.target.value)} placeholder="напр. брак" />
              </div>
              <Button onClick={submitReturn} disabled={submittingReturn} variant="outline" className="w-full sm:w-auto">
                {submittingReturn ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />}
                Оформити повернення
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {removeItemConfirm && (
        <ConfirmDialog
          message={`Прибрати «${removeItemConfirm.title}» із замовлення?`}
          subMessage="Товар лишиться в історії замовлення (закреслений, сума 0) і звільнить зарезервовану кількість на складі. Це можна скасувати кнопкою відновлення."
          destructive
          confirmLabel="Прибрати"
          onConfirm={() => toggleItemActive(removeItemConfirm.id, false)}
          onCancel={() => setRemoveItemConfirm(null)}
        />
      )}
    </>
  );
}
