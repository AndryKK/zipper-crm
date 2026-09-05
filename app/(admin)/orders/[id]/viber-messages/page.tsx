"use client";
import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { Header } from "@/components/admin/header";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ArrowLeft, Copy, Phone, Send, Loader2, ExternalLink, Check, RefreshCw, CheckCircle2 } from "lucide-react";

type ViberMessage = { key: string; title: string; hint: string; text: string; action?: "confirm-payment" };
type ViberData = {
  orderId: number;
  docNumber: string;
  clientName: string;
  clientPhone: string | null;
  clientPhoneViber: string | null;
  orderTotal: number;
  messages: ViberMessage[];
};

// Best-effort clipboard write — plain navigator.clipboard.writeText fails
// silently (throws) in some older iOS Safari / in-app-browser contexts
// (Viber's own in-app browser included), so this falls back to the classic
// hidden-textarea + execCommand('copy') trick, which those same browsers
// still support.
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

// Viber has no public deep link that both opens a specific contact's chat
// AND pre-fills text in one step — viber://forward?text= pre-fills text but
// always makes the user pick a recipient themselves, viber://chat?number=
// opens the right chat but ignores any text param. Best available
// compromise: copy the message to the clipboard first, then navigate to
// viber://chat?number=... — Viber opens on the correct client, and the
// text is already sitting on the clipboard ready to paste. May not work on
// every phone — iOS requires the scheme navigation to happen synchronously
// off the actual tap, so callers use a plain <a href> rather than a
// delayed script redirect.
async function sendViaViber(text: string, phoneViber: string) {
  await copyText(text);
  toast.message("Текст скопійовано — відкриваю Viber…", {
    description: "Якщо чат відкрився порожнім, вставте текст (затиснути поле вводу → Вставити).",
  });
  window.location.href = `viber://chat?number=${phoneViber}`;
}

// Per-message "did I already send this" checkmark — purely local to this
// browser/device (a personal reminder, not a shared audit trail; the
// CRM's own welcome_email_sent_at/doc_field_1/status fields are already
// the real record of what actually went out by email). Keyed by order so
// it doesn't leak across orders, and by message key so re-sending stage 2
// doesn't un-mark stage 1.
function sentStorageKey(orderId: number, msgKey: string) {
  return `viber-sent:${orderId}:${msgKey}`;
}
function readSentAt(orderId: number, msgKey: string): string | null {
  try { return localStorage.getItem(sentStorageKey(orderId, msgKey)); } catch { return null; }
}
function writeSentAt(orderId: number, msgKey: string) {
  try { localStorage.setItem(sentStorageKey(orderId, msgKey), new Date().toISOString()); } catch { /* ignore */ }
}

function MessageCard({
  orderId, msg, clientPhoneViber, onPaymentConfirmed,
}: {
  orderId: number; msg: ViberMessage; clientPhoneViber: string | null;
  onPaymentConfirmed?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [sentAt, setSentAt] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => { setSentAt(readSentAt(orderId, msg.key)); }, [orderId, msg.key]);

  async function onCopy() {
    const ok = await copyText(msg.text);
    if (ok) {
      setCopied(true);
      toast.success("Скопійовано!");
      setTimeout(() => setCopied(false), 1800);
    } else {
      toast.error("Не вдалося скопіювати — виділіть текст вручну");
    }
  }

  async function onSend() {
    if (!clientPhoneViber) return;

    // This one template also does the exact same thing the order page's
    // own "Підтвердити оплату" button does (see confirmPayment there) —
    // status → "Оплачено", TTN creation, customer thank-you email, AND the
    // internal payment-notification email — so sending it in Viber is a
    // real "mark this order as paid" action, not just a text template.
    // Only proceed to the Viber hand-off once that's genuinely confirmed;
    // a failed API call means nothing was actually marked paid, so sending
    // the "Дякуємо за оплату" text anyway would lie to the client.
    if (msg.action === "confirm-payment") {
      setConfirming(true);
      try {
        const res = await fetch(`/api/orders/${orderId}/confirm-payment`, { method: "POST" });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          toast.error(data?.error ?? "Не вдалося підтвердити оплату");
          return;
        }
        const hasError = (data?.log ?? []).some((l: { status: string }) => l.status === "error");
        if (hasError) toast.warning("Оплату підтверджено з помилками — перевірте деталі замовлення");
        else toast.success("Оплату підтверджено!");
        onPaymentConfirmed?.();
      } catch {
        toast.error("Помилка з'єднання під час підтвердження оплати");
        return;
      } finally {
        setConfirming(false);
      }
    }

    await sendViaViber(msg.text, clientPhoneViber);
    writeSentAt(orderId, msg.key);
    setSentAt(new Date().toISOString());
  }

  return (
    <div className="crm-card" style={{ padding: 16 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>{msg.title}</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{msg.hint}</div>
        </div>
        {sentAt && (
          <div
            title={`Надіслано ${new Date(sentAt).toLocaleString("uk-UA")}`}
            style={{
              display: "flex", alignItems: "center", gap: 4, flexShrink: 0,
              padding: "3px 9px", borderRadius: 999, background: "rgba(16,185,129,0.12)",
              color: "#10b981", fontSize: 11, fontWeight: 600, whiteSpace: "nowrap",
            }}
          >
            <CheckCircle2 size={12} /> Надіслано
          </div>
        )}
      </div>
      {sentAt && (
        <div style={{ fontSize: 11.5, color: "#10b981", marginBottom: 8 }}>
          Ви надсилали це повідомлення клієнту {new Date(sentAt).toLocaleDateString("uk-UA")}.
        </div>
      )}
      <pre
        style={{
          margin: 0,
          padding: "12px 14px",
          background: "var(--bg)",
          border: "1px solid var(--border)",
          borderRadius: 10,
          fontSize: 13,
          lineHeight: 1.55,
          color: "var(--text)",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          fontFamily: "inherit",
          maxHeight: 260,
          overflowY: "auto",
        }}
      >
        {msg.text}
      </pre>
      <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
        <Button
          onClick={onCopy}
          size="sm"
          variant="outline"
          style={{ flex: "1 1 140px", gap: 6 }}
        >
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? "Скопійовано" : "Копіювати текст"}
        </Button>
        {clientPhoneViber && (
          <a
            href={`viber://chat?number=${clientPhoneViber}`}
            onClick={(e) => { e.preventDefault(); if (!confirming) onSend(); }}
            aria-disabled={confirming}
            style={{
              flex: "1 1 140px", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
              padding: "0 12px", height: 32, borderRadius: 8,
              background: "linear-gradient(135deg,#7360f2,#8f5db7)",
              color: "#fff", fontSize: 12.5, fontWeight: 600,
              textDecoration: "none",
              opacity: confirming ? 0.6 : 1,
              pointerEvents: confirming ? "none" : "auto",
            }}
          >
            {confirming ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
            {confirming ? "Підтверджую оплату…" : "Надіслати"}
          </a>
        )}
      </div>
    </div>
  );
}

export default function ViberMessagesPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<ViberData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [phoneCopied, setPhoneCopied] = useState(false);

  const load = useCallback(async () => {
    const d = await apiFetch<ViberData>(`/api/orders/${params.id}/viber-messages`);
    setData(d);
  }, [params.id]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  // Order state (discount, items, status, TTN...) can change after this
  // page was first opened — messages are generated fresh on every fetch
  // from the order's current state (see the route), so this just re-runs
  // that fetch rather than only reflecting whatever was true at page-open.
  async function onRefresh() {
    setRefreshing(true);
    try {
      await load();
      toast.success("Повідомлення оновлено за поточними даними замовлення!");
    } finally {
      setRefreshing(false);
    }
  }

  async function onCopyPhone() {
    if (!data?.clientPhone) return;
    const ok = await copyText(data.clientPhone);
    if (ok) {
      setPhoneCopied(true);
      toast.success("Номер скопійовано!");
      setTimeout(() => setPhoneCopied(false), 1800);
    } else {
      toast.error("Не вдалося скопіювати");
    }
  }

  return (
    <>
      <Header
        title="Viber"
        subtitle={data ? `Замовлення #${data.orderId}` : undefined}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={loading || refreshing}
            style={{ gap: 6 }}
          >
            {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw size={14} />}
            <span className="hidden sm:inline">Оновити</span>
          </Button>
        }
      />
      <div className="p-4 md:p-6 space-y-4" style={{ maxWidth: 640, margin: "0 auto" }}>
        <button
          onClick={() => router.push(`/orders/${params.id}`)}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4" />Назад до замовлення
        </button>

        {loading ? (
          <div style={{ padding: 48, textAlign: "center", color: "var(--text-muted)" }}>
            <Loader2 className="h-5 w-5 animate-spin" style={{ margin: "0 auto 8px" }} />
            Завантаження...
          </div>
        ) : !data ? (
          <div style={{ padding: 48, textAlign: "center", color: "var(--text-muted)" }}>
            Не вдалося завантажити замовлення
          </div>
        ) : (
          <>
            {/* Client phone — big, tap-to-call, easy to copy. This is the
                CLIENT's own number (users.phone via order.login), not the
                delivery recipient's — see the route's own comment. */}
            <div className="crm-card" style={{ padding: 16 }}>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 6 }}>
                Номер клієнта ({data.clientName})
              </div>
              {data.clientPhone ? (
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <a
                    href={`tel:${data.clientPhone}`}
                    style={{
                      display: "flex", alignItems: "center", gap: 8,
                      fontSize: 22, fontWeight: 700, color: "var(--text)",
                      textDecoration: "none", fontFamily: "monospace",
                    }}
                  >
                    <Phone size={18} color="var(--accent)" />
                    {data.clientPhone}
                  </a>
                  <Button
                    onClick={onCopyPhone}
                    variant="outline"
                    size="sm"
                    style={{ gap: 6, background: phoneCopied ? "#10b981" : undefined, color: phoneCopied ? "#fff" : undefined }}
                  >
                    {phoneCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    {phoneCopied ? "Скопійовано" : "Копіювати"}
                  </Button>
                </div>
              ) : (
                <div style={{ color: "var(--text-muted)", fontSize: 14 }}>Телефон не вказано</div>
              )}
            </div>

            <div style={{ fontSize: 12, color: "var(--text-muted)", padding: "0 2px" }}>
              Повідомлення з'являються по мірі опрацювання замовлення — текст точно відповідає тому, що надсилається на email. Скопіюйте потрібне або надішліть його кнопкою під повідомленням. Документи за посиланнями відкриваються без входу в CRM. Якщо в замовленні щось змінилось — натисніть «Оновити» вгорі.
            </div>

            {data.messages.map((m) => (
              <MessageCard
                key={m.key}
                orderId={data.orderId}
                msg={m}
                clientPhoneViber={data.clientPhoneViber}
                onPaymentConfirmed={load}
              />
            ))}

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", paddingTop: 4 }}>
              {data.messages.flatMap((m) => {
                const urls = m.text.match(/https?:\/\/\S+/g) ?? [];
                return urls.map((url, i) => (
                  <a
                    key={`${m.key}-${i}`}
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 5,
                      fontSize: 12, color: "var(--accent)", textDecoration: "none",
                    }}
                  >
                    <ExternalLink size={12} /> {m.title.replace(/^\d+\.\s*/, "")}{urls.length > 1 ? ` (${i + 1})` : ""}
                  </a>
                ));
              })}
            </div>
          </>
        )}
      </div>
    </>
  );
}
