import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { auth } from "@/lib/auth";
import { createOrderTtn } from "@/lib/order-ttn";
import { sendPaymentConfirmedEmail } from "@/lib/order-emails";
import { isValidEmail } from "@/lib/email";
import { revalidateTag } from "next/cache";

type StepStatus = "ok" | "error" | "skipped" | "warn";
type StepLog = { step: string; status: StepStatus; msg: string; data?: Record<string, unknown> };

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const orderId = parseInt(id);
  const body = await req.json().catch(() => ({}));

  const weight = Number(body.weight);
  const length = Number(body.length);
  const width  = Number(body.width);
  const height = Number(body.height);
  if (![weight, length, width, height].every((n) => Number.isFinite(n) && n > 0)) {
    return NextResponse.json({ error: "Некоректні габарити посилки" }, { status: 400 });
  }

  const { data: order } = await supabaseServer.from("orders").select("*").eq("id", orderId).single();
  if (!order) return NextResponse.json({ error: "Замовлення не знайдено" }, { status: 404 });

  const log: StepLog[] = [];

  /* ════════════════════════════════════════════════════════════════════
     STEP 1 — формування ТТН на поштомат (без накладеного платежу — Нова
     Пошта видає з поштоматів лише повністю передоплачені посилки)
  ══════════════════════════════════════════════════════════════════════ */
  const ttnResult = await createOrderTtn(orderId, { requirePostomat: true, seat: { weight, length, width, height } });
  if (!ttnResult.ok) {
    return NextResponse.json({ error: ttnResult.error }, { status: 400 });
  }
  log.push({
    step: "Формування ТТН (поштомат)", status: "ok",
    msg: ttnResult.demo ? `[ДЕМО-РЕЖИМ] Згенеровано випадковий ТТН ${ttnResult.ttn}` : `ТТН ${ttnResult.ttn} створено`,
    data: { ttn: ttnResult.ttn, demo: ttnResult.demo },
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

  await supabaseServer.from("orders").update({ status: "Оплачено" }).eq("id", orderId);
  revalidateTag("sidebar-counts", { expire: 0 });

  return NextResponse.json({ log, orderId });
}
