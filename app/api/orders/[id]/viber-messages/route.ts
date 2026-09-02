import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase";
import { getOrderDocumentData, welcomeGreetingText } from "@/lib/order-documents";
import { paymentRequestIntro, paymentConfirmedIntro } from "@/lib/email-templates";
import { signOrderDocToken } from "@/lib/doc-token";
import { looksLikePhone } from "@/lib/phone";

// Ukrainian mobile numbers are stored in whatever shape whoever typed them
// used (0XXXXXXXXX, +380XXXXXXXXX, spaces/dashes...) — Viber's own
// viber://chat deep link wants a bare international-format digit string.
function toViberPhone(raw: string): string {
  const d = raw.replace(/\D/g, "");
  if (d.startsWith("380") && d.length === 12) return d;
  if (d.startsWith("0") && d.length === 10) return `38${d}`;
  if (d.length === 9) return `380${d}`;
  return d;
}

// Same pipeline the order page itself uses (PIPELINE in
// app/(admin)/orders/[id]/page.tsx) — exact status-string match, not fuzzy,
// since every status here is written by this app's own routes.
const PAID_STATUSES = new Set(["Оплачено", "Відправлено", "Завершено"]);

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const orderId = parseInt(id);

  const doc = await getOrderDocumentData(orderId);
  if (!doc) return NextResponse.json({ error: "Замовлення не знайдено" }, { status: 404 });
  const { order, orderTotal, docNumber } = doc;

  // The account's own phone (users.phone, via order.login) is the actual
  // CLIENT's number — order.phone is only ever the shipping recipient's
  // (see recipientPhone in lib/order-ttn.ts), which can be someone else
  // entirely when the client orders a gift for delivery to another person.
  // Falls back to order.phone when there's no registered account, or its
  // phone field is garbage (seen live: literal "1").
  let clientPhone = order.phone as string | null;
  if (order.login) {
    const { data: user } = await supabaseServer.from("users").select("phone").eq("login", order.login).maybeSingle();
    if (looksLikePhone(user?.phone)) clientPhone = user!.phone;
  }
  const clientPhoneViber = clientPhone ? toViberPhone(clientPhone) : null;

  // Greeting-only name — see lib/order-documents.ts's own comment. Never
  // used for NP/shipping data.
  const name = order.original_client_name || order.person || order.login || "клієнте";

  const origin = req.nextUrl.origin;
  const token = await signOrderDocToken(orderId);
  const link = (path: string, extra?: string) =>
    `${origin}/api/orders/${orderId}/${path}?token=${token}${extra ? `&${extra}` : ""}`;

  // Was this order's item list actually touched by a manager since the
  // customer's own checkout — same detection the process route uses (see
  // its own comment) — so the invoice-stage message picks the same
  // "itemsChanged" copy the real email would have sent, not always the
  // default "availability confirmed" framing.
  const { data: allItems } = await supabaseServer.from("orders_item").select("active, added_by_admin").eq("oid", orderId);
  const itemsChanged = (allItems ?? []).some((i) => i.active === false)
    || (allItems ?? []).some((i) => i.active !== false && i.added_by_admin);

  const hasInvoice = !!order.doc_field_1;
  const hasPayment = !!order.status && PAID_STATUSES.has(order.status);

  // Messages appear progressively, mirroring exactly how far the order has
  // actually been processed — same three stages the CRM's own emails send
  // (sendWelcomeEmail / sendPaymentRequestEmail / sendPaymentConfirmedEmail),
  // in the same order, with the same wording (see the imported *Intro
  // helpers — single source of truth shared with the HTML emails so Viber
  // text can never say something different from what was actually
  // emailed). A later stage never replaces an earlier one — all stages
  // reached so far stay visible.
  const messages: { key: string; title: string; hint: string; text: string }[] = [];

  messages.push({
    key: "welcome",
    title: "Вітальне повідомлення",
    hint: "Надсилається одразу після оформлення замовлення",
    text: `🎉 *Замовлення №${order.id} отримано!*\n\n${welcomeGreetingText(name, order.id)}\n\n📄 Деталі замовлення: ${link("receipt", "greeting=1")}`,
  });

  if (hasInvoice) {
    const reason = itemsChanged ? "itemsChanged" as const : "confirmed" as const;
    const intro = paymentRequestIntro(name, order, docNumber, { reason });
    const emoji = reason === "itemsChanged" ? "📝" : "✅";
    messages.push({
      key: "invoice",
      title: "Рахунок та накладна",
      hint: reason === "itemsChanged" ? "Склад замовлення було змінено — надіслано оновлений рахунок" : "Наявність підтверджено — надіслано рахунок і накладну",
      text: `${emoji} *${intro.title}*\n\n${intro.text}\n\n💰 Сума до сплати: *${orderTotal.toFixed(2)} грн*\n\n📄 Рахунок-фактура: ${link("invoice")}\n📦 Видаткова накладна: ${link("waybill")}`,
    });
  }

  if (hasPayment) {
    const intro = paymentConfirmedIntro(name, order, order.ttn ?? null);
    const ttnBlock = order.ttn
      ? `\n\n📦 ТТН (Нова Пошта): *${order.ttn}*\nhttps://novaposhta.ua/tracking/${order.ttn}`
      : "";
    messages.push({
      key: "payment",
      title: "Оплата підтверджена",
      hint: order.ttn ? "Оплату отримано, номер ТТН для відстеження додано" : "Оплату отримано, замовлення готується до відправки",
      text: `✅ *${intro.title}*\n\n${intro.text}${ttnBlock}`,
    });
  }

  // Numbered by actual position, not a fixed 1-4 — a "Новий" order only
  // ever has message #1 here, not gaps where #2/#3 would've been.
  const numberedMessages = messages.map((m, i) => ({ ...m, key: m.key, title: `${i + 1}. ${m.title}` }));

  return NextResponse.json({
    orderId: order.id,
    docNumber,
    clientName: name,
    clientPhone,
    clientPhoneViber,
    orderTotal,
    messages: numberedMessages,
  });
}
