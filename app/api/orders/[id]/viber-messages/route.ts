import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase";
import { getOrderDocumentData } from "@/lib/order-documents";
import { signOrderDocToken } from "@/lib/doc-token";

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

function looksLikePhone(v: string | null | undefined): v is string {
  return !!v && v.replace(/\D/g, "").length >= 9;
}

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
  // used for NP/shipping data, only for how the client is addressed here.
  const name = order.original_client_name || order.person || order.login || "клієнте";

  const origin = req.nextUrl.origin;
  const token = await signOrderDocToken(orderId);
  const link = (path: string, extra?: string) =>
    `${origin}/api/orders/${orderId}/${path}?token=${token}${extra ? `&${extra}` : ""}`;

  const links = {
    welcome: link("receipt", "greeting=1"),
    invoice: link("invoice"),
    receipt: link("receipt"),
    waybill: link("waybill"),
  };

  const total = orderTotal.toFixed(2);

  // Viber's own text formatting: *bold*, _italic_, ~strikethrough~ — plain
  // \n line breaks, no HTML. Four ready-to-paste steps in the order a real
  // order actually moves through the pipeline.
  const messages = [
    {
      key: "welcome",
      title: "1. Вітальне повідомлення",
      hint: "Надсилається одразу після оформлення замовлення",
      text: `🎉 *Замовлення №${order.id} отримано!*\n\nДякуємо за замовлення, ${name}! Перевіряємо наявність товару на наших складах — щойно підтвердимо, надішлемо рахунок на оплату.\n\n📄 Деталі замовлення: ${links.welcome}`,
    },
    {
      key: "invoice",
      title: "2. Рахунок на оплату",
      hint: "Наявність підтверджено — надсилається рахунок-фактура",
      text: `✅ *Наявність підтверджено!*\n\nЗамовлення №${order.id} готове до оплати.\n💰 Сума до сплати: *${total} грн*\n\n📄 Рахунок-фактура: ${links.invoice}`,
    },
    {
      key: "receipt",
      title: "3. Накладна зі знижкою",
      hint: "Підсумкова сума з урахуванням особистої знижки клієнта",
      text: `🏷 *Накладна зі знижкою*\n\nВаша особиста знижка вже врахована в сумі.\n💰 Сума до сплати: *${total} грн*\n\n📄 Накладна: ${links.receipt}`,
    },
    {
      key: "waybill",
      title: "4. Видаткова накладна",
      hint: "Документ для отримання посилки на Новій Пошті",
      text: `📦 *Видаткова накладна*\n\nДокумент до вашого замовлення №${order.id} для отримання посилки на Новій Пошті.\n\n📄 Накладна: ${links.waybill}`,
    },
  ];

  return NextResponse.json({
    orderId: order.id,
    docNumber,
    clientName: name,
    clientPhone,
    clientPhoneViber,
    orderTotal,
    messages,
  });
}
