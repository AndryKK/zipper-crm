"use client";
import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { Header } from "@/components/admin/header";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ArrowLeft, Copy, Phone, Send, Loader2, ExternalLink, Check, RefreshCw } from "lucide-react";

type ViberMessage = { key: string; title: string; hint: string; text: string };
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

function MessageCard({ msg, clientPhoneViber }: { msg: ViberMessage; clientPhoneViber: string | null }) {
  const [copied, setCopied] = useState(false);

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

  return (
    <div className="crm-card" style={{ padding: 16 }}>
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>{msg.title}</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{msg.hint}</div>
      </div>
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
            onClick={(e) => { e.preventDefault(); sendViaViber(msg.text, clientPhoneViber); }}
            style={{
              flex: "1 1 140px", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
              padding: "0 12px", height: 32, borderRadius: 8,
              background: "linear-gradient(135deg,#7360f2,#8f5db7)",
              color: "#fff", fontSize: 12.5, fontWeight: 600,
              textDecoration: "none",
            }}
          >
            <Send size={13} />
            Надіслати
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

  // Order state (discount, items, invoice number, totals...) can change
  // after this page was first opened — the messages below are generated
  // once at load time, so this re-fetches and regenerates all four from
  // scratch rather than only reflecting whatever was true at page-open.
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

              {data.clientPhoneViber && (
                <a
                  href={`viber://chat?number=${data.clientPhoneViber}`}
                  onClick={(e) => { e.preventDefault(); sendViaViber(data.messages[0].text, data.clientPhoneViber!); }}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                    marginTop: 12, padding: "10px 16px", borderRadius: 10,
                    background: "linear-gradient(135deg,#7360f2,#8f5db7)",
                    color: "#fff", fontSize: 13.5, fontWeight: 600,
                    textDecoration: "none",
                  }}
                >
                  <Send size={15} />
                  Надіслати через Viber
                </a>
              )}
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 6, lineHeight: 1.4 }}>
                Копіює перше повідомлення в буфер обміну і відкриває чат з клієнтом у Viber — може не спрацювати на всіх телефонах. Якщо чат відкрився порожнім, вставте текст вручну. Те саме є під кожним повідомленням нижче.
              </div>
            </div>

            <div style={{ fontSize: 12, color: "var(--text-muted)", padding: "0 2px" }}>
              Готові повідомлення в хронологічному порядку — скопіюйте потрібне й надішліть у Viber. Документи за посиланнями відкриваються без входу в CRM. Якщо в замовленні щось змінилось — натисніть «Оновити» вгорі, щоб перегенерувати всі повідомлення.
            </div>

            {data.messages.map((m) => (
              <MessageCard key={m.key} msg={m} clientPhoneViber={data.clientPhoneViber} />
            ))}

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", paddingTop: 4 }}>
              {data.messages.map((m) => (
                <a
                  key={m.key}
                  href={m.text.match(/https?:\/\/\S+/)?.[0]}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 5,
                    fontSize: 12, color: "var(--accent)", textDecoration: "none",
                  }}
                >
                  <ExternalLink size={12} /> {m.title.replace(/^\d+\.\s*/, "")}
                </a>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}
