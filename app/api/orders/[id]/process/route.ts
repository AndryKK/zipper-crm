import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { auth } from "@/lib/auth";
import { checkOrderStock } from "@/lib/order-stock";
import { sendPaymentRequestEmail } from "@/lib/order-emails";
import { isValidEmail } from "@/lib/email";

type StepStatus = "ok" | "error" | "skipped" | "warn";
type StepLog = { step: string; status: StepStatus; msg: string; data?: Record<string, unknown> };

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const orderId = parseInt(id);
  const body = await req.json().catch(() => ({}));
  const log: StepLog[] = [];

  /* ── Fetch order + items ─────────────────────────────────────────── */
  const { data: order } = await supabaseServer.from("orders").select("*").eq("id", orderId).single();
  if (!order) return NextResponse.json({ error: "Замовлення не знайдено" }, { status: 404 });

  // Set from the stock-confirmation popup ("Товари габаритні?") — decides
  // which Nova Poshta sender warehouse a later TTN-creation step uses (see
  // finishTtnCreation in lib/order-ttn.ts). Only written when explicitly
  // passed so a bare/legacy call to this route never silently resets it.
  if (typeof body.isOversized === "boolean") {
    await supabaseServer.from("orders").update({ is_oversized: body.isOversized }).eq("id", orderId);
  }

  // Manual supplier override (also from the stock-confirmation popup) —
  // must be written before STEP 3 below generates the invoice/sends the
  // email, since getOrderDocumentData reads it fresh from the order row.
  // 1/2 forces that supplier; anything else (including omitted) leaves the
  // automatic amount-vs-threshold pick alone.
  if (body.supplierOverride === 1 || body.supplierOverride === 2 || body.supplierOverride === null) {
    await supabaseServer.from("orders").update({ supplier_override: body.supplierOverride }).eq("id", orderId);
  }

  const { data: items } = await supabaseServer.from("orders_item").select("*").eq("oid", orderId);
  if (!items?.length) return NextResponse.json({ error: "Замовлення без товарів" }, { status: 400 });

  const orderTotal = (items as { price: number; quantity: number }[]).reduce(
    (s, i) => s + i.price * i.quantity, 0
  );

  /* ════════════════════════════════════════════════════════════════════
     STEP 1 — перевірка наявності (інформаційно)
  ══════════════════════════════════════════════════════════════════════ */
  const stockResult = await checkOrderStock(orderId);
  log.push({ step: "Наявність на складі", ...stockResult });

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
     STEP 3 — лист клієнту з рахунком (файлом) та видатковою накладною
     (файлом), з реквізитами оплати та відділенням Нової Пошти
  ══════════════════════════════════════════════════════════════════════ */
  if (!isValidEmail(order.login)) {
    log.push({ step: "Email клієнту", status: "skipped", msg: "Email клієнта відсутній або некоректний" });
  } else {
    try {
      const result = await sendPaymentRequestEmail(orderId);
      log.push(
        result.ok
          ? { step: "Email клієнту", status: "ok", msg: `Рахунок і накладна надіслані на ${order.login}` }
          : { step: "Email клієнту", status: "error", msg: result.error }
      );
    } catch (e) {
      log.push({ step: "Email клієнту", status: "error", msg: (e as Error).message });
    }
  }

  /* ── Оновити статус → "В роботі" ────────────────────────────────── */
  await supabaseServer.from("orders").update({ status: "В роботі" }).eq("id", orderId);

  return NextResponse.json({ log, orderId });
}
