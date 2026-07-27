import { supabaseServer } from "@/lib/supabase";
import { npFindCityRef, npFindWarehouseRef, npCreateTtn, npDeleteTtn, parseNpAddress } from "@/lib/nova-poshta";

// Shared by every path that can end up creating a Nova Poshta TTN for an
// order — the standard "Підтвердити оплату" flow, the cash-on-delivery
// ("накладений платіж") flow, and the postomat flow — so demo-mode
// handling, settings validation and address resolution live in one place.

function getSetting(settings: { value: string; text: string }[], key: string) {
  return settings.find((s) => s.value === key)?.text?.trim() ?? "";
}

// Демо-режим (Налаштування → Nova Poshta → "np_demo_mode") — генерує
// випадковий 14-значний номер замість звернення до реального API НП.
function randomDemoTtn(): string {
  let s = "";
  for (let i = 0; i < 14; i++) s += Math.floor(Math.random() * 10);
  return s;
}

export type CreateTtnOptions = {
  // Cash-on-delivery: recipient pays this amount in cash on pickup. Nova
  // Poshta doesn't support this for postomats — pass forbidPostomat too
  // when offering this in the UI so that combination is rejected clearly.
  codAmount?: number;
  // Postomat shipments need real per-parcel dimensions instead of a flat
  // guessed weight.
  seat?: { weight: number; length: number; width: number; height: number };
  // Validation gates for the specialised flows.
  requirePostomat?: boolean;
  forbidPostomat?: boolean;
  // Used by the plain "Підтвердити оплату" flow: postomat destinations
  // aren't an error there, they just need the dedicated postomat button —
  // report it as skipped rather than failed.
  skipPostomat?: boolean;
};

export type CreateTtnResult =
  | { ok: true; ttn: string; demo: boolean }
  | { ok: false; kind: "skipped" | "warn" | "error"; error: string };

// Shared tail once we have a resolved recipient city AND warehouse ref
// (the address-parsing flow resolves warehouseNum -> ref itself first,
// since that lookup needs the parsed number; the manual flow already has
// a ref straight from npSearchWarehouses) — so demo-mode handling,
// sender-settings validation and the actual npCreateTtn call only live in
// one place.
async function finishTtnCreation(
  orderId: number,
  order: { person: string | null; login: string | null; phone: string | null; is_oversized?: boolean },
  orderTotal: number,
  recipient: { cityRef: string; warehouseRef: string; isPostomat: boolean },
  opts: Pick<CreateTtnOptions, "codAmount" | "seat">
): Promise<CreateTtnResult> {
  const { data: allSettings } = await supabaseServer.from("settings").select("value, text");
  const settings = allSettings ?? [];

  const npDemoMode = getSetting(settings, "np_demo_mode") === "1";
  if (npDemoMode) {
    const demoTtn = randomDemoTtn();
    await supabaseServer.from("orders").update({ ttn: demoTtn, ttn_auto_created: true }).eq("id", orderId);
    return { ok: true, ttn: demoTtn, demo: true };
  }

  const npApiKey           = getSetting(settings, "np_api_key") || process.env.NOVA_POSHTA_API_KEY || "";
  const npSenderRef        = getSetting(settings, "np_sender_ref");
  const npSenderContactRef = getSetting(settings, "np_sender_contact_ref");
  const npSenderCityRef    = getSetting(settings, "np_sender_city_ref");
  // Товари, позначені як габаритні на попапі підтвердження наявності
  // (orders.is_oversized), відправляються з окремого відділення (Відділення
  // №18 — витримує великі/важкі посилки), решта — з основного (Відділення
  // №100). Якщо оверсайз-реф не налаштовано, тихо падаємо назад на основний,
  // а не вимагаємо його для КОЖНОГО замовлення.
  const npSenderWhRef =
    (order.is_oversized && getSetting(settings, "np_sender_warehouse_ref_oversized")) ||
    getSetting(settings, "np_sender_warehouse_ref");
  const npSenderPhone      = getSetting(settings, "np_sender_phone");

  const missing = [
    !npApiKey           && "np_api_key",
    !npSenderRef        && "np_sender_ref",
    !npSenderContactRef && "np_sender_contact_ref",
    !npSenderCityRef    && "np_sender_city_ref",
    !npSenderWhRef      && "np_sender_warehouse_ref",
    !npSenderPhone      && "np_sender_phone",
  ].filter(Boolean);
  if (missing.length) return { ok: false, kind: "skipped", error: `Не налаштовано: ${missing.join(", ")}` };

  try {
    const result = await npCreateTtn({
      apiKey:               npApiKey,
      senderRef:            npSenderRef,
      senderContactRef:     npSenderContactRef,
      senderCityRef:        npSenderCityRef,
      senderWarehouseRef:   npSenderWhRef,
      senderPhone:          npSenderPhone,
      recipientName:        order.person ?? order.login ?? "Отримувач",
      recipientPhone:       order.phone!,
      recipientCityRef:      recipient.cityRef,
      recipientWarehouseRef: recipient.warehouseRef,
      weight:      opts.seat?.weight ?? 0.5,
      cost:        orderTotal,
      description: "Товари",
      codAmount:   opts.codAmount,
      seat:        opts.seat,
    });

    if ("error" in result) return { ok: false, kind: "error", error: result.error };

    await supabaseServer.from("orders").update({ ttn: result.ttn, ttn_auto_created: true }).eq("id", orderId);
    return { ok: true, ttn: result.ttn, demo: false };
  } catch (e) {
    return { ok: false, kind: "error", error: (e as Error).message };
  }
}

export async function createOrderTtn(orderId: number, opts: CreateTtnOptions = {}): Promise<CreateTtnResult> {
  const { data: order } = await supabaseServer.from("orders").select("*").eq("id", orderId).single();
  if (!order) return { ok: false, kind: "error", error: "Замовлення не знайдено" };

  if (order.ttn) return { ok: false, kind: "skipped", error: `ТТН вже існує: ${order.ttn}` };

  const { data: items } = await supabaseServer.from("orders_item").select("*").eq("oid", orderId);
  if (!items?.length) return { ok: false, kind: "error", error: "Замовлення без товарів" };

  const orderTotal = (items as { price: number; quantity: number }[]).reduce(
    (s, i) => s + i.price * i.quantity, 0
  );

  if (!order.phone) return { ok: false, kind: "skipped", error: "Телефон отримувача відсутній" };
  if (!order.addr_delivery) return { ok: false, kind: "skipped", error: "Адреса доставки відсутня" };

  const parsed = parseNpAddress(order.addr_delivery);
  if (!parsed) {
    return { ok: false, kind: "warn", error: "Не вдалося розпарсити адресу (підтримується формат «Місто — Відділення №N» або «Місто — Поштомат №N») — скористайтесь ручним введенням нижче" };
  }
  if (opts.requirePostomat && !parsed.isPostomat) {
    return { ok: false, kind: "error", error: "Адреса доставки — не поштомат" };
  }
  if (opts.skipPostomat && parsed.isPostomat) {
    return { ok: false, kind: "skipped", error: "Це поштомат — скористайтесь кнопкою «Відправити на поштомат» нижче" };
  }
  if (opts.forbidPostomat && parsed.isPostomat) {
    return { ok: false, kind: "error", error: "Накладений платіж не підтримується Новою Поштою для поштоматів (видача лише після повної передоплати) — скористайтесь ручним керуванням." };
  }

  const { data: allSettings } = await supabaseServer.from("settings").select("value, text");
  const npApiKey = getSetting(allSettings ?? [], "np_api_key") || process.env.NOVA_POSHTA_API_KEY || "";
  if (!npApiKey) return { ok: false, kind: "skipped", error: "Не налаштовано: np_api_key" };

  const recipientCityRef = await npFindCityRef(npApiKey, parsed.city);
  if (!recipientCityRef) {
    return {
      ok: false, kind: "error",
      error: `Місто не знайдено в НП: ${parsed.city} — скористайтесь ручним введенням нижче`,
    };
  }

  const recipientWhRef = await npFindWarehouseRef(npApiKey, recipientCityRef, parsed.warehouseNum);
  if (!recipientWhRef) {
    return {
      ok: false, kind: "error",
      error: `${parsed.isPostomat ? "Поштомат" : "Відділення"} №${parsed.warehouseNum} не знайдено в ${parsed.city} — скористайтесь ручним введенням нижче`,
    };
  }

  return finishTtnCreation(
    orderId, order, orderTotal,
    { cityRef: recipientCityRef, warehouseRef: recipientWhRef, isPostomat: parsed.isPostomat },
    opts
  );
}

// Escape hatch for when parseNpAddress can't make sense of the order's
// free-text delivery address (or the city/warehouse it names can't be
// found in Nova Poshta) — the manual TTN form resolves city/warehouse
// refs itself via npSearchCities/npSearchWarehouses, so this skips
// address parsing entirely and goes straight to TTN creation with the
// refs a manager picked.
export async function createOrderTtnManual(
  orderId: number,
  params: { cityRef: string; warehouseRef: string; isPostomat: boolean; seat?: { weight: number; length: number; width: number; height: number }; codAmount?: number }
): Promise<CreateTtnResult> {
  const { data: order } = await supabaseServer.from("orders").select("*").eq("id", orderId).single();
  if (!order) return { ok: false, kind: "error", error: "Замовлення не знайдено" };
  if (order.ttn) return { ok: false, kind: "skipped", error: `ТТН вже існує: ${order.ttn}` };

  const { data: items } = await supabaseServer.from("orders_item").select("*").eq("oid", orderId);
  if (!items?.length) return { ok: false, kind: "error", error: "Замовлення без товарів" };
  const orderTotal = (items as { price: number; quantity: number }[]).reduce(
    (s, i) => s + i.price * i.quantity, 0
  );

  if (!order.phone) return { ok: false, kind: "skipped", error: "Телефон отримувача відсутній" };
  if (params.isPostomat && params.codAmount) {
    return { ok: false, kind: "error", error: "Накладений платіж не підтримується Новою Поштою для поштоматів" };
  }

  const { data: allSettings } = await supabaseServer.from("settings").select("value, text");
  const npApiKey = getSetting(allSettings ?? [], "np_api_key") || process.env.NOVA_POSHTA_API_KEY || "";
  if (!npApiKey) return { ok: false, kind: "skipped", error: "Не налаштовано: np_api_key" };

  return finishTtnCreation(
    orderId, order, orderTotal,
    { cityRef: params.cityRef, warehouseRef: params.warehouseRef, isPostomat: params.isPostomat },
    { seat: params.seat, codAmount: params.codAmount }
  );
}

// Read-only resolution used by the COD confirmation screen — returns what
// *would* be sent to Nova Poshta without creating anything, so a manager
// can review it before committing.
export type ResolvePreview =
  | {
      ok: true;
      recipientName: string;
      recipientPhone: string;
      city: string;
      warehouseNum: number;
      isPostomat: boolean;
      weight: number;
      cost: number;
      orderTotal: number;
      prepayment: number;
      codAmount: number;
      demo: boolean;
    }
  | { ok: false; error: string };

export async function resolveCodPreview(orderId: number): Promise<ResolvePreview> {
  const { data: order } = await supabaseServer.from("orders").select("*").eq("id", orderId).single();
  if (!order) return { ok: false, error: "Замовлення не знайдено" };
  if (order.ttn) return { ok: false, error: `ТТН вже існує: ${order.ttn}` };

  const { data: items } = await supabaseServer.from("orders_item").select("*").eq("oid", orderId);
  if (!items?.length) return { ok: false, error: "Замовлення без товарів" };
  const orderTotal = (items as { price: number; quantity: number }[]).reduce(
    (s, i) => s + i.price * i.quantity, 0
  );

  if (!order.phone) return { ok: false, error: "Телефон отримувача відсутній" };
  if (!order.addr_delivery) return { ok: false, error: "Адреса доставки відсутня" };

  const parsed = parseNpAddress(order.addr_delivery);
  if (!parsed) return { ok: false, error: "Не вдалося розпарсити адресу доставки" };
  if (parsed.isPostomat) {
    return { ok: false, error: "Накладений платіж не підтримується Новою Поштою для поштоматів (видача лише після повної передоплати)." };
  }

  const { data: allSettings } = await supabaseServer.from("settings").select("value, text");
  const settings = allSettings ?? [];
  const npDemoMode = getSetting(settings, "np_demo_mode") === "1";

  const prepayment = Number(order.prepayment) || 0;
  const codAmount = Math.max(0, orderTotal - prepayment);

  return {
    ok: true,
    recipientName: order.person ?? order.login ?? "Отримувач",
    recipientPhone: order.phone,
    city: parsed.city,
    warehouseNum: parsed.warehouseNum,
    isPostomat: parsed.isPostomat,
    weight: 0.5,
    cost: orderTotal,
    orderTotal,
    prepayment,
    codAmount,
    demo: npDemoMode,
  };
}

export type CancelTtnResult = { ok: true; demo: boolean } | { ok: false; error: string };

// Only ever offered in the UI for TTNs this CRM created itself
// (ttn_auto_created) — a manually-typed TTN might belong to a shipment
// created outside our system (or already picked up), so we refuse to touch
// it here even if asked; the caller is expected to gate the button on that
// flag too, this is just the server-side backstop.
export async function cancelOrderTtn(orderId: number): Promise<CancelTtnResult> {
  const { data: order } = await supabaseServer.from("orders").select("*").eq("id", orderId).single();
  if (!order) return { ok: false, error: "Замовлення не знайдено" };
  if (!order.ttn) return { ok: false, error: "ТТН відсутній" };
  if (!order.ttn_auto_created) {
    return { ok: false, error: "Цей ТТН введено вручну, а не створений у CRM — скасуйте його безпосередньо в кабінеті Нової Пошти" };
  }

  const { data: allSettings } = await supabaseServer.from("settings").select("value, text");
  const settings = allSettings ?? [];
  const npDemoMode = getSetting(settings, "np_demo_mode") === "1";

  if (!npDemoMode) {
    const npApiKey = getSetting(settings, "np_api_key") || process.env.NOVA_POSHTA_API_KEY || "";
    if (!npApiKey) return { ok: false, error: "np_api_key не налаштовано" };

    const result = await npDeleteTtn(npApiKey, order.ttn);
    if ("error" in result) return { ok: false, error: result.error };
  }

  await supabaseServer.from("orders").update({ ttn: null, ttn_auto_created: false }).eq("id", orderId);
  return { ok: true, demo: npDemoMode };
}
