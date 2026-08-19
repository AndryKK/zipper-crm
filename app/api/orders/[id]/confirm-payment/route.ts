import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { auth } from "@/lib/auth";
import { createOrderTtn } from "@/lib/order-ttn";
import { sendPaymentConfirmedEmail } from "@/lib/order-emails";
import { isValidEmail } from "@/lib/email";
import { revalidateTag } from "next/cache";

type StepStatus = "ok" | "error" | "skipped" | "warn";
type StepLog = { step: string; status: StepStatus; msg: string; data?: Record<string, unknown> };

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const orderId = parseInt(id);
  const log: StepLog[] = [];

  const { data: order } = await supabaseServer.from("orders").select("*").eq("id", orderId).single();
  if (!order) return NextResponse.json({ error: "Замовлення не знайдено" }, { status: 404 });

  // active=false items are removed from the order — see
  // scripts/add-orders-item-active-column.sql.
  const { data: items } = await supabaseServer.from("orders_item").select("*").eq("oid", orderId).eq("active", true);
  if (!items?.length) return NextResponse.json({ error: "Замовлення без товарів" }, { status: 400 });

  /* ════════════════════════════════════════════════════════════════════
     STEP 1 — формування ТТН Нова Пошта (без накладеного платежу — оплата
     вже надійшла банківським переказом). Поштомати сюди не потрапляють:
     видача там лише після повної передоплати на самій Новій Пошті, а не
     через цей крок — для них є окрема кнопка «Відправити на поштомат».
  ══════════════════════════════════════════════════════════════════════ */
  const ttnResult = await createOrderTtn(orderId, { skipPostomat: true });
  if (ttnResult.ok) {
    log.push({
      step: "Формування ТТН", status: "ok",
      msg: ttnResult.demo ? `[ДЕМО-РЕЖИМ] Згенеровано випадковий ТТН ${ttnResult.ttn} — реального звернення до Нової Пошти не було` : `ТТН ${ttnResult.ttn} створено`,
      data: { ttn: ttnResult.ttn, demo: ttnResult.demo },
    });
  } else {
    log.push({ step: "Формування ТТН", status: ttnResult.kind, msg: ttnResult.error });
  }

  /* ════════════════════════════════════════════════════════════════════
     STEP 2 — склад
     Товар вже зарезервовано (списано) на кроці появи товару в замовленні —
     див. /api/webhooks/inventory-sync — тож тут нічого не списуємо повторно,
     лише інформуємо.
  ══════════════════════════════════════════════════════════════════════ */
  log.push({ step: "Склад", status: "ok", msg: "Товар вже зарезервовано під це замовлення при його появі" });

  /* ════════════════════════════════════════════════════════════════════
     STEP 3 — лист-подяка клієнту за оплату, з номером ТТН — лише якщо ТТН
     справді щойно створено. Лист із порожнім номером ТТН вводить клієнта
     в оману ("оплату отримано, готуємо до відправки" без жодного способу
     відстежити посилку), тож коли формування ТТН не вдалося (помилка,
     поштомат, немає адреси тощо) лист автоматично НЕ надсилається —
     менеджер надсилає його вручну кнопкою "без ТТН" після ручного
     розбору ситуації (кнопка "Обрати вручну" / поштомат / рахунок).
  ══════════════════════════════════════════════════════════════════════ */
  if (!ttnResult.ok) {
    log.push({ step: "Email клієнту", status: "skipped", msg: "ТТН не створено — лист не надіслано автоматично; скористайтесь кнопкою «Надіслати без ТТН»" });
  } else if (!isValidEmail(order.login)) {
    log.push({ step: "Email клієнту", status: "skipped", msg: "Email клієнта відсутній або некоректний" });
  } else {
    try {
      const result = await sendPaymentConfirmedEmail(orderId);
      log.push(
        result.ok
          ? { step: "Email клієнту", status: "ok", msg: `Лист-подяка (з ТТН) надіслано на ${order.login}` }
          : { step: "Email клієнту", status: "error", msg: result.error }
      );
    } catch (e) {
      log.push({ step: "Email клієнту", status: "error", msg: (e as Error).message });
    }
  }

  /* ── Оновити статус → "Оплачено" ────────────────────────────────── */
  await supabaseServer.from("orders").update({ status: "Оплачено" }).eq("id", orderId);
  revalidateTag("sidebar-counts", { expire: 0 });

  return NextResponse.json({ log, orderId });
}
