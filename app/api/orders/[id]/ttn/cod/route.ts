import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { auth } from "@/lib/auth";
import { resolveCodPreview, createOrderTtn } from "@/lib/order-ttn";
import { sendPaymentConfirmedEmail } from "@/lib/order-emails";
import { isValidEmail } from "@/lib/email";
import { revalidateTag } from "next/cache";

type StepStatus = "ok" | "error" | "skipped" | "warn";
type StepLog = { step: string; status: StepStatus; msg: string; data?: Record<string, unknown> };

// GET — read-only preview of exactly what would be sent to Nova Poshta
// (recipient, city/warehouse, weight, cost, cash-on-delivery amount), so a
// manager can review before committing to actually creating the TTN.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const preview = await resolveCodPreview(parseInt(id));
  if (!preview.ok) return NextResponse.json({ error: preview.error }, { status: 400 });
  return NextResponse.json(preview);
}

// POST — actually create the TTN with BackwardDeliveryData (накладений
// платіж). Body may include `codAmount` to override the computed
// (замовлення − передоплата) figure — the confirmation dialog lets a
// manager edit it by hand before sending.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const orderId = parseInt(id);
  const body = await req.json().catch(() => ({}));

  const { data: order } = await supabaseServer.from("orders").select("*").eq("id", orderId).single();
  if (!order) return NextResponse.json({ error: "Замовлення не знайдено" }, { status: 404 });
  const { data: items } = await supabaseServer.from("orders_item").select("*").eq("oid", orderId);
  if (!items?.length) return NextResponse.json({ error: "Замовлення без товарів" }, { status: 400 });

  const orderTotal = (items as { price: number; quantity: number }[]).reduce(
    (s, i) => s + i.price * i.quantity, 0
  );
  const prepayment = Number(order.prepayment) || 0;
  const defaultCodAmount = Math.max(0, orderTotal - prepayment);

  const overrideAmount = Number(body.codAmount);
  const codAmount = Number.isFinite(overrideAmount) && overrideAmount > 0 ? overrideAmount : defaultCodAmount;

  const log: StepLog[] = [];

  /* ════════════════════════════════════════════════════════════════════
     STEP 1 — формування ТТН з накладеним платежем (сума замовлення за
     вирахуванням передоплати, або вручну відредаговане значення)
  ══════════════════════════════════════════════════════════════════════ */
  const ttnResult = await createOrderTtn(orderId, { codAmount, forbidPostomat: true });
  if (!ttnResult.ok) {
    return NextResponse.json({ error: ttnResult.error }, { status: 400 });
  }
  log.push({
    step: "Формування ТТН (накладений платіж)", status: "ok",
    msg: ttnResult.demo
      ? `[ДЕМО-РЕЖИМ] Згенеровано випадковий ТТН ${ttnResult.ttn} — накладений платіж ${codAmount.toFixed(2)} грн не надсилався реально`
      : `ТТН ${ttnResult.ttn} створено, накладений платіж ${codAmount.toFixed(2)} грн`,
    data: { ttn: ttnResult.ttn, demo: ttnResult.demo, codAmount },
  });

  log.push({ step: "Склад", status: "ok", msg: "Товар вже зарезервовано під це замовлення при його появі" });

  if (!isValidEmail(order.login)) {
    log.push({ step: "Email клієнту", status: "skipped", msg: "Email клієнта відсутній або некоректний" });
  } else {
    try {
      const result = await sendPaymentConfirmedEmail(orderId);
      log.push(
        result.ok
          ? { step: "Email клієнту", status: "ok", msg: `Лист-подяка надіслано на ${order.login}` }
          : { step: "Email клієнту", status: "error", msg: result.error }
      );
    } catch (e) {
      log.push({ step: "Email клієнту", status: "error", msg: (e as Error).message });
    }
  }

  // Status moves straight to "Оплачено" even though payment hasn't
  // actually landed yet — the recipient pays cash to Nova Poshta on
  // pickup, which is the same downstream state (shipped, awaiting/settled
  // payment) the rest of the pipeline already expects at this point.
  await supabaseServer.from("orders").update({ status: "Оплачено" }).eq("id", orderId);
  revalidateTag("sidebar-counts", { expire: 0 });

  return NextResponse.json({ log, orderId });
}
