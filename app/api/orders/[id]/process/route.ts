import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { auth } from "@/lib/auth";
import { checkOrderStock } from "@/lib/order-stock";
import { sendPaymentRequestEmail } from "@/lib/order-emails";
import { isValidEmail } from "@/lib/email";
import { isGuestCheckoutEmail } from "@/lib/guest-checkout";
import { revalidateTag } from "next/cache";
import type { EmailRenderOptions } from "@/lib/email-templates";
import { getUahRate, computeItemPricingForProduct } from "@/lib/pricing";

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

  // Organization/ЄДРПОУ — set/edited from the stock-confirmation popup or
  // the "змінити і надіслати повторно" discount box (see orgCheckbox in
  // orders/[id]/page.tsx). Read straight off this order row by every later
  // Nova Poshta TTN path (lib/order-ttn.ts's finishTtnCreation) unless a
  // manager overrides it again in the manual TTN dialog.
  if (typeof body.isOrganization === "boolean") {
    await supabaseServer.from("orders").update({
      is_organization: body.isOrganization,
      edrpou: body.isOrganization ? String(body.edrpou ?? "").trim() || null : null,
    }).eq("id", orderId);
  }

  // Manual supplier override (also from the stock-confirmation popup) —
  // must be written before STEP 3 below generates the invoice/sends the
  // email, since getOrderDocumentData reads it fresh from the order row.
  // 1/2 forces that supplier; anything else (including omitted) leaves the
  // automatic amount-vs-threshold pick alone.
  if (body.supplierOverride === 1 || body.supplierOverride === 2 || body.supplierOverride === null) {
    await supabaseServer.from("orders").update({ supplier_override: body.supplierOverride }).eq("id", orderId);
  }

  // Fetched unfiltered (not just active=true) so we can tell whether any
  // line was actually removed since the customer's own checkout — see the
  // itemsChanged/reason logic below. active=false rows still never count
  // toward the total or get emailed to the client.
  const { data: allItems } = await supabaseServer.from("orders_item").select("*").eq("oid", orderId);
  const items = (allItems ?? []).filter((i) => i.active !== false);
  if (!items.length) return NextResponse.json({ error: "Замовлення без товарів" }, { status: 400 });

  /* ── Client discount — recompute active items' price whenever a manager
     explicitly passes a new %% (the "змінити знижку і надіслати повторно"
     action). Without an explicit value, existing prices are left exactly
     as they were (this route runs on every normal "Підтвердити і
     опрацювати" too, and must not silently re-price an order nobody asked
     to re-price).

     Recomputing used to mean a flat price_base*(1-newDiscountPercent/100)
     for EVERY item — which silently threw away a category/quantity bulk
     discount the storefront had correctly applied at checkout (e.g. a
     -20%-at-1000-units category rule replaced by whatever flat %% this
     popup defaults to) and clobbered a manager's own manually-typed price
     just the same. Now goes through computeItemPricingForProduct() (same
     category → tier → flat priority as cart.php's
     product_price_prod_simple_in_cart()) and skips any item flagged
     price_manual — see app/api/orders/[id]/items/[itemId]/route.ts's PUT,
     which sets that flag only when a manager's edit actually changes the
     stored price. ─────────────────────────────────────────────────────── */
  let discountPercent: number | null = null;
  if (typeof body.discountPercent === "number" && Number.isFinite(body.discountPercent)) {
    const newDiscountPercent = body.discountPercent;
    discountPercent = newDiscountPercent;
    await supabaseServer.from("orders").update({ discount_percent: newDiscountPercent }).eq("id", orderId);

    const rate = await getUahRate();
    for (const item of items as { id: number; product: number; quantity: number; price: number; price_base: number; price_manual?: boolean }[]) {
      if (item.price_manual) continue;
      const pricing = await computeItemPricingForProduct(item.product, item.quantity, rate, newDiscountPercent);
      if (!pricing) continue; // product since deleted — leave whatever price the line already has
      const { priceBase, price: newPrice } = pricing;
      if (Math.abs(newPrice - item.price) > 0.001 || Math.abs(item.price_base - priceBase) > 0.001) {
        await supabaseServer.from("orders_item").update({ price: newPrice, price_base: priceBase }).eq("id", item.id);
        item.price = newPrice;
        item.price_base = priceBase;
      }
    }
  }

  const orderTotal = (items as { price: number; quantity: number }[]).reduce(
    (s, i) => s + i.price * i.quantity, 0
  );

  // Was this order's item list actually touched by a manager since the
  // customer's own checkout (an out-of-stock swap, a manual add, a
  // removed line)? If so the "availability confirmed" framing is
  // misleading — see lib/email-templates.ts's "itemsChanged" copy.
  const itemsChanged = (allItems ?? []).some((i) => i.active === false) || items.some((i: { added_by_admin?: boolean }) => i.added_by_admin);
  // "discountChanged" copy ("Ми перерахували вартість...") only makes
  // sense as a resend — an order being processed for the very first time
  // (no prior invoice) hasn't had anything "recalculated" from the
  // customer's point of view yet, even though the stock-check popup
  // always sends a concrete discountPercent (see openStockConfirm in the
  // order page).
  const hadPriorInvoice = !!order.doc_field_1;
  const emailReason: EmailRenderOptions["reason"] = discountPercent != null && hadPriorInvoice
    ? "discountChanged"
    : itemsChanged ? "itemsChanged" : "confirmed";

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
  if (isGuestCheckoutEmail(order.login)) {
    log.push({ step: "Email клієнту", status: "skipped", msg: "Замовлення без реєстрації (спільний email сайту) — лист не надсилається, зв'яжіться з клієнтом за телефоном" });
  } else if (!isValidEmail(order.login)) {
    log.push({ step: "Email клієнту", status: "skipped", msg: "Email клієнта відсутній або некоректний" });
  } else {
    try {
      const result = await sendPaymentRequestEmail(orderId, undefined, {
        reason: emailReason,
        discountPercent: emailReason === "discountChanged" ? discountPercent! : undefined,
      });
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
  revalidateTag("sidebar-counts", { expire: 0 });

  return NextResponse.json({ log, orderId });
}
