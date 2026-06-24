import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { auth } from "@/lib/auth";
import { npFindCityRef, npFindWarehouseRef, npCreateTtn, parseNpAddress } from "@/lib/nova-poshta";

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

  const { data: order } = await supabaseServer.from("orders").select("*").eq("id", orderId).single();
  if (!order) return NextResponse.json({ error: "Замовлення не знайдено" }, { status: 404 });

  const { data: items } = await supabaseServer.from("orders_item").select("*").eq("oid", orderId);
  if (!items?.length) return NextResponse.json({ error: "Замовлення без товарів" }, { status: 400 });

  const { data: allSettings } = await supabaseServer.from("settings").select("value, text");
  const settings = allSettings ?? [];

  const orderTotal = (items as { price: number; quantity: number }[]).reduce(
    (s, i) => s + i.price * i.quantity, 0
  );

  /* ════════════════════════════════════════════════════════════════════
     STEP 1 — формування ТТН Нова Пошта
  ══════════════════════════════════════════════════════════════════════ */
  const npApiKey           = getSetting(settings, "np_api_key") || process.env.NOVA_POSHTA_API_KEY || "";
  const npSenderRef        = getSetting(settings, "np_sender_ref");
  const npSenderContactRef = getSetting(settings, "np_sender_contact_ref");
  const npSenderCityRef    = getSetting(settings, "np_sender_city_ref");
  const npSenderWhRef      = getSetting(settings, "np_sender_warehouse_ref");
  const npSenderPhone      = getSetting(settings, "np_sender_phone");

  const missing = [
    !npApiKey           && "np_api_key",
    !npSenderRef        && "np_sender_ref",
    !npSenderContactRef && "np_sender_contact_ref",
    !npSenderCityRef    && "np_sender_city_ref",
    !npSenderWhRef      && "np_sender_warehouse_ref",
    !npSenderPhone      && "np_sender_phone",
  ].filter(Boolean);

  if (missing.length) {
    log.push({ step: "Формування ТТН", status: "skipped", msg: `Не налаштовано: ${missing.join(", ")}` });
  } else if (!order.phone) {
    log.push({ step: "Формування ТТН", status: "skipped", msg: "Телефон отримувача відсутній" });
  } else if (!order.addr_delivery) {
    log.push({ step: "Формування ТТН", status: "skipped", msg: "Адреса доставки відсутня" });
  } else if (order.ttn) {
    log.push({ step: "Формування ТТН", status: "skipped", msg: `ТТН вже існує: ${order.ttn}` });
  } else {
    try {
      const parsed = parseNpAddress(order.addr_delivery);
      if (!parsed) {
        log.push({ step: "Формування ТТН", status: "warn", msg: "Не вдалося розпарсити адресу (підтримується формат «Місто — Відділення №N»)" });
      } else {
        const recipientCityRef = await npFindCityRef(npApiKey, parsed.city);
        if (!recipientCityRef) {
          log.push({ step: "Формування ТТН", status: "error", msg: `Місто не знайдено в НП: ${parsed.city}` });
        } else {
          const recipientWhRef = await npFindWarehouseRef(npApiKey, recipientCityRef, parsed.warehouseNum);
          if (!recipientWhRef) {
            log.push({ step: "Формування ТТН", status: "error", msg: `Відділення №${parsed.warehouseNum} не знайдено в ${parsed.city}` });
          } else {
            const result = await npCreateTtn({
              apiKey:               npApiKey,
              senderRef:            npSenderRef,
              senderContactRef:     npSenderContactRef,
              senderCityRef:        npSenderCityRef,
              senderWarehouseRef:   npSenderWhRef,
              senderPhone:          npSenderPhone,
              recipientName:        order.person ?? order.login ?? "Отримувач",
              recipientPhone:       order.phone,
              recipientCityRef,
              recipientWarehouseRef: recipientWhRef,
              weight:      0.5,
              cost:        orderTotal,
              description: "Товари",
            });

            if ("error" in result) {
              log.push({ step: "Формування ТТН", status: "error", msg: result.error });
            } else {
              await supabaseServer.from("orders").update({ ttn: result.ttn }).eq("id", orderId);
              log.push({ step: "Формування ТТН", status: "ok", msg: `ТТН ${result.ttn} створено`, data: { ttn: result.ttn } });
            }
          }
        }
      }
    } catch (e) {
      log.push({ step: "Формування ТТН", status: "error", msg: (e as Error).message });
    }
  }

  /* ════════════════════════════════════════════════════════════════════
     STEP 2 — списання зі складу
  ══════════════════════════════════════════════════════════════════════ */
  const { data: warehouses } = await supabaseServer
    .from("warehouses").select("id, title, priority")
    .eq("active", 1).order("priority", { ascending: true }).limit(2);

  const wh0 = warehouses?.[0];
  const wh1 = warehouses?.[1];

  if (!wh0) {
    log.push({ step: "Списання зі складу", status: "skipped", msg: "Жодного складу не налаштовано" });
  } else {
    const productIds = items.map((i: { product: number }) => i.product);
    const { data: inventory } = await supabaseServer
      .from("inventory").select("product_id, warehouse_id, quantity")
      .in("product_id", productIds)
      .in("warehouse_id", [wh0.id, wh1?.id].filter(Boolean));

    const invMap: Record<string, number> = {};
    for (const row of inventory ?? []) invMap[`${row.product_id}_${row.warehouse_id}`] = Number(row.quantity);

    const deductLog: string[] = [];
    let hasError = false;

    for (const item of items as { product: number; quantity: number }[]) {
      let remaining = item.quantity;

      const avail0 = invMap[`${item.product}_${wh0.id}`] ?? 0;
      if (avail0 > 0 && remaining > 0) {
        const take0 = Math.min(avail0, remaining);
        await supabaseServer.from("inventory")
          .update({ quantity: avail0 - take0 })
          .eq("product_id", item.product).eq("warehouse_id", wh0.id);
        remaining -= take0;
        deductLog.push(`#${item.product}: -${take0} з «${wh0.title}»`);
      }

      if (remaining > 0 && wh1) {
        const avail1 = invMap[`${item.product}_${wh1.id}`] ?? 0;
        if (avail1 > 0) {
          const take1 = Math.min(avail1, remaining);
          await supabaseServer.from("inventory")
            .update({ quantity: avail1 - take1 })
            .eq("product_id", item.product).eq("warehouse_id", wh1.id);
          remaining -= take1;
          deductLog.push(`#${item.product}: -${take1} з «${wh1.title}»`);
        }
      }

      if (remaining > 0) {
        deductLog.push(`#${item.product}: НЕ ВИСТАЧАЄ ${remaining} шт`);
        hasError = true;
      }
    }

    log.push({
      step:   "Списання зі складу",
      status: hasError ? "warn" : "ok",
      msg:    deductLog.join("; ") || "Товари списано",
    });
  }

  /* ── Оновити статус → "Оплачено" ────────────────────────────────── */
  await supabaseServer.from("orders").update({ status: "Оплачено" }).eq("id", orderId);

  return NextResponse.json({ log, orderId });
}
