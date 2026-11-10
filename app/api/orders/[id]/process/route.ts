import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { auth } from "@/lib/auth";
import { checkOrderStock } from "@/lib/order-stock";
import { sendPaymentRequestEmail } from "@/lib/order-emails";
import { isValidEmail } from "@/lib/email";
import { isGuestCheckoutEmail } from "@/lib/guest-checkout";
import type { EmailRenderOptions } from "@/lib/email-templates";
import { getUahRate, computeItemPricingForProduct, computeFlatItemPricing } from "@/lib/pricing";

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

  // Organization/ЄДРПОУ — set/edited from the stock-confirmation popup or
  // the "змінити і надіслати повторно" discount box (see orgCheckbox in
  // orders/[id]/page.tsx). Read straight off this order row by every later
  // Nova Poshta TTN path (lib/order-ttn.ts's finishTtnCreation) unless a
  // manager overrides it again in the manual TTN dialog.
  //
  // np_noncash_payment ("Оплата за доставку безготівково") only makes
  // sense alongside is_organization — the checkbox for it only ever shows
  // in the UI once ЄДРПОУ is entered (see nonCashCheckbox in
  // orders/[id]/page.tsx) — so it's forced false the moment isOrganization
  // itself is false, same as edrpou above, instead of possibly keeping a
  // stale true from an earlier organization order.
  if (typeof body.isOrganization === "boolean") {
    await supabaseServer.from("orders").update({
      is_organization: body.isOrganization,
      edrpou: body.isOrganization ? String(body.edrpou ?? "").trim() || null : null,
      np_noncash_payment: body.isOrganization ? !!body.nonCashPayment : false,
    }).eq("id", orderId);
  }

  // "Інший платник" (also from the stock-confirmation popup) — the invoice's
  // "Платник" and waybill's "Покупець" get issued to this entity instead of
  // the parcel recipient. Same store-only contract as
  // app/api/orders/[id]/alt-payer: only written when the key is present, so
  // a bare/legacy call never clears it. Object with any subset of
  // {name,code,address,iban,bank,phone} filled -> active; null -> off.
  if (body.altPayer !== undefined) {
    const src = body.altPayer && typeof body.altPayer === "object" ? body.altPayer : {};
    const clean: Record<string, string> = {};
    for (const f of ["name", "code", "address", "iban", "bank", "phone"]) {
      const v = String(src[f] ?? "").trim();
      if (v) clean[f] = v;
    }
    await supabaseServer.from("orders")
      .update({ alt_payer: Object.keys(clean).length ? clean : null }).eq("id", orderId);
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
     action, or the dedicated force-discount action below). Without an
     explicit value, existing prices are left exactly as they were (this
     route runs on every normal "Підтвердити і опрацювати" too, and must
     not silently re-price an order nobody asked to re-price).

     Default: computeItemPricingForProduct() (same category → tier → flat
     priority as cart.php's product_price_prod_simple_in_cart()) — an
     item's own category/quantity bulk discount always wins when it
     qualifies, newDiscountPercent is only ever the FALLBACK for items
     that don't. Also skips any item flagged price_manual — see
     app/api/orders/[id]/items/[itemId]/route.ts's PUT, which sets that
     flag only when a manager's edit actually changes the stored price.

     forceDiscountPercent — ONLY ever sent by the dedicated "Застосувати
     примусово знижку" button (orders/[id]/page.tsx's forceApplyDiscount,
     with its own confirm step) — applies newDiscountPercent straight to
     EVERY item via computeFlatItemPricing, bypassing category/tier
     entirely. Deliberately NOT wired into the ordinary "Опрацювати" or
     "Змінити знижку і надіслати повторно" paths: it used to be (REMOVED
     2026-11-03, restored the same day as its own separate action) — a
     manager opened the "Змінити і надіслати повторно" panel only to flip
     the "Організація (ЄДРПОУ)" checkbox, clicked its one shared button,
     and that silently force-flattened a 2000-unit line's real
     -20%-at-1000 category discount down to the order's plain 5% client
     discount (order 21526: charged 12635.06 instead of the invoiced
     10955.06) — a side effect nobody intended from an action that had
     nothing to do with pricing. Forcing a flat %% is a real, legitimate
     need sometimes, but only as its own deliberate, separately-confirmed
     action, never a default or a silent side effect of something else. A
     genuine one-off override for one specific line is still price_manual,
     set directly on that line — never touched by either branch here. */
  let discountPercent: number | null = null;
  if (typeof body.discountPercent === "number" && Number.isFinite(body.discountPercent)) {
    const newDiscountPercent = body.discountPercent;
    const forceDiscountPercent = body.forceDiscountPercent === true;
    discountPercent = newDiscountPercent;
    await supabaseServer.from("orders").update({ discount_percent: newDiscountPercent }).eq("id", orderId);

    const rate = await getUahRate();
    for (const item of items as { id: number; product: number; quantity: number; price: number; price_base: number; price_manual?: boolean }[]) {
      if (item.price_manual) continue;
      const pricing = forceDiscountPercent
        ? await computeFlatItemPricing(item.product, rate, newDiscountPercent)
        : await computeItemPricingForProduct(item.product, item.quantity, rate, newDiscountPercent);
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
  // No on-demand revalidateTag("sidebar-counts") here anymore — see
  // app/(admin)/layout.tsx's getSidebarCounts for why; the sidebar badge
  // picks this up via its own 120s periodic refresh instead.
  await supabaseServer.from("orders").update({ status: "В роботі" }).eq("id", orderId);

  return NextResponse.json({ log, orderId });
}
