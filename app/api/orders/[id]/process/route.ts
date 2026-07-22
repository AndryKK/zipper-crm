import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { auth } from "@/lib/auth";
// Viber sending is temporarily disabled — see STEP 3 below. Uncomment this
// import together with the code in STEP 3 to turn it back on.
// import { sendViberMessage } from "@/lib/viber";

type StepStatus = "ok" | "error" | "skipped" | "warn";
type StepLog = { step: string; status: StepStatus; msg: string; data?: Record<string, unknown> };

function getSetting(settings: { value: string; text: string }[], key: string) {
  return settings.find((s) => s.value === key)?.text?.trim() ?? "";
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const orderId = parseInt(id);
  const log: StepLog[] = [];

  /* ── Fetch order + items ─────────────────────────────────────────── */
  const { data: order } = await supabaseServer.from("orders").select("*").eq("id", orderId).single();
  if (!order) return NextResponse.json({ error: "Замовлення не знайдено" }, { status: 404 });

  const { data: items } = await supabaseServer.from("orders_item").select("*").eq("oid", orderId);
  if (!items?.length) return NextResponse.json({ error: "Замовлення без товарів" }, { status: 400 });

  const { data: allSettings } = await supabaseServer.from("settings").select("value, text");
  const settings = allSettings ?? [];

  /* ── Fetch warehouses ────────────────────────────────────────────── */
  const { data: warehouses } = await supabaseServer
    .from("warehouses").select("id, title, priority")
    .eq("active", 1).order("priority", { ascending: true }).limit(2);
  const wh0 = warehouses?.[0];
  const wh1 = warehouses?.[1];

  const orderTotal = (items as { price: number; quantity: number }[]).reduce(
    (s, i) => s + i.price * i.quantity, 0
  );

  /* ════════════════════════════════════════════════════════════════════
     STEP 1 — перевірка наявності (інформаційно)
  ══════════════════════════════════════════════════════════════════════ */
  const productIds = items.map((i: { product: number }) => i.product);
  const { data: inventory } = await supabaseServer
    .from("inventory").select("product_id, warehouse_id, quantity")
    .in("product_id", productIds)
    .in("warehouse_id", [wh0?.id, wh1?.id].filter(Boolean));

  const invMap: Record<string, number> = {};
  for (const row of inventory ?? []) invMap[`${row.product_id}_${row.warehouse_id}`] = Number(row.quantity);

  const stockIssues: string[] = [];
  for (const item of items as { product: number; quantity: number }[]) {
    const q0    = wh0 ? (invMap[`${item.product}_${wh0.id}`] ?? 0) : 0;
    const q1    = wh1 ? (invMap[`${item.product}_${wh1.id}`] ?? 0) : 0;
    const total = q0 + q1;
    if (total < item.quantity) stockIssues.push(`Товар #${item.product}: потрібно ${item.quantity}, є ${total}`);
  }
  log.push(
    stockIssues.length
      ? { step: "Наявність на складі", status: "warn", msg: stockIssues.join("; ") }
      : { step: "Наявність на складі", status: "ok",   msg: "Всі товари в наявності" }
  );

  /* ════════════════════════════════════════════════════════════════════
     STEP 2 — формування рахунку
  ══════════════════════════════════════════════════════════════════════ */
  const invoiceNumber = String(orderId);
  const { error: invErr } = await supabaseServer
    .from("orders").update({ doc_field_1: invoiceNumber }).eq("id", orderId);

  if (invErr) {
    log.push({ step: "Формування рахунку", status: "error", msg: invErr.message });
  } else {
    log.push({
      step: "Формування рахунку", status: "ok",
      msg:  `Рахунок ${invoiceNumber} сформовано (${orderTotal.toFixed(2)} грн)`,
      data: { invoiceNumber, total: orderTotal },
    });
  }

  /* ════════════════════════════════════════════════════════════════════
     STEP 3 — відправка на Viber з посиланням для відстеження
     Тимчасово вимкнено. Щоб увімкнути назад: розкоментувати імпорт
     sendViberMessage вгорі файлу та блок нижче.
  ══════════════════════════════════════════════════════════════════════ */
  log.push({ step: "Viber повідомлення", status: "skipped", msg: "Тимчасово вимкнено" });
  /*
  const viberToken = getSetting(settings, "viber_token");
  const siteUrl    = process.env.NEXTAUTH_URL ?? "";

  if (!viberToken) {
    log.push({ step: "Viber повідомлення", status: "skipped", msg: "viber_token не налаштовано" });
  } else if (!order.phone) {
    log.push({ step: "Viber повідомлення", status: "skipped", msg: "Телефон клієнта відсутній" });
  } else {
    const itemLines = (items as { product: number; quantity: number; price: number }[])
      .map((i) => `• Товар #${i.product}: ${i.quantity} шт × ${i.price.toFixed(2)} грн`)
      .join("\n");

    const trackLink = siteUrl ? `${siteUrl}/track/${orderId}` : "";

    const message = [
      `Шановний(а) ${order.person ?? "клієнте"}!`,
      ``,
      `Рахунок ${invoiceNumber} по вашому замовленню:`,
      itemLines,
      ``,
      `Сума до сплати: ${orderTotal.toFixed(2)} грн`,
      trackLink ? `\nСтатус замовлення: ${trackLink}` : "",
      ``,
      `Дякуємо за замовлення! — Zipper`,
    ].filter((l) => l !== undefined).join("\n");

    const viber = await sendViberMessage(viberToken, order.phone, message);
    if (viber.ok) {
      log.push({ step: "Viber повідомлення", status: "ok",    msg: `Відправлено на ${order.phone}` });
    } else {
      log.push({ step: "Viber повідомлення", status: "error", msg: viber.error ?? "Невідома помилка" });
    }
  }
  */

  /* ── Оновити статус → "В роботі" ────────────────────────────────── */
  await supabaseServer.from("orders").update({ status: "В роботі" }).eq("id", orderId);

  return NextResponse.json({ log, orderId });
}
