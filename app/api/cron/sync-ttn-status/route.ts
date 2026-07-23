import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { auth } from "@/lib/auth";
import { npGetStatus } from "@/lib/nova-poshta";
import { RETURN_STATUS } from "@/lib/returns";

function getSetting(settings: { value: string; text: string }[], key: string) {
  return settings.find((s) => s.value === key)?.text?.trim() ?? "";
}

// Nova Poshta has no webhook for third-party API keys, so this is a polling
// check: called once a day by Vercel Cron (see vercel.json — Authorization:
// Bearer $CRON_SECRET, added automatically by Vercel) for every order stuck
// at "Відправлено", and also callable on-demand for a single order via the
// "Перевірити статус НП" button on the order page (admin session instead).
//
// The same poll also covers return-shipment TTNs (customer shipping an item
// back): a CONFIRMED return with a ttn set moves to ARRIVED once NP reports
// it delivered — see RETURN_STATUS.ARRIVED in lib/returns.ts for why that
// status change is itself the "notify the manager" mechanism. Skipped for
// on-demand single-order checks (?orderId=...) so clicking "Перевірити
// статус НП" on one order's page doesn't also sweep every pending return.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const isCron = process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`;
  if (!isCron) {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const onlyOrderId = searchParams.get("orderId");
  const onlyReturnId = searchParams.get("returnId");

  const { data: allSettings } = await supabaseServer.from("settings").select("value, text");
  const settings = allSettings ?? [];
  const apiKey = getSetting(settings, "np_api_key") || process.env.NOVA_POSHTA_API_KEY || "";
  if (!apiKey) return NextResponse.json({ error: "np_api_key не налаштовано" }, { status: 400 });

  const log: { orderId: number; ttn: string; status?: string; delivered?: boolean; error?: string }[] = [];
  const returnLog: { returnId: number; ttn: string; status?: string; delivered?: boolean; error?: string }[] = [];

  if (!onlyReturnId) {
    let query = supabaseServer.from("orders").select("id, ttn, phone").eq("status", "Відправлено").not("ttn", "is", null);
    if (onlyOrderId) query = query.eq("id", parseInt(onlyOrderId));
    const { data: orders } = await query;

    for (const order of orders ?? []) {
      try {
        const result = await npGetStatus(apiKey, order.ttn, order.phone ?? undefined);
        if (!result) { log.push({ orderId: order.id, ttn: order.ttn, error: "Немає відповіді від НП" }); continue; }
        if (result.isDelivered) {
          // "Отримано" used to be a separate step with a further manual/14-day
          // wait before "Завершено" — merged into one: once NP confirms
          // delivery, the order is done, no extra step needed.
          await supabaseServer.from("orders").update({ status: "Завершено" }).eq("id", order.id);
        }
        log.push({ orderId: order.id, ttn: order.ttn, status: result.status, delivered: result.isDelivered });
      } catch (e) {
        log.push({ orderId: order.id, ttn: order.ttn, error: (e as Error).message });
      }
    }
  }

  if (!onlyOrderId) {
    let rquery = supabaseServer
      .from("orders_returns")
      .select("id, ttn, phone")
      .eq("status", RETURN_STATUS.CONFIRMED)
      .not("ttn", "is", null);
    if (onlyReturnId) rquery = rquery.eq("id", parseInt(onlyReturnId));
    const { data: returns } = await rquery;

    for (const ret of returns ?? []) {
      try {
        const result = await npGetStatus(apiKey, ret.ttn, ret.phone ?? undefined);
        if (!result) { returnLog.push({ returnId: ret.id, ttn: ret.ttn, error: "Немає відповіді від НП" }); continue; }
        if (result.isDelivered) {
          await supabaseServer.from("orders_returns").update({ status: RETURN_STATUS.ARRIVED }).eq("id", ret.id);
        }
        returnLog.push({ returnId: ret.id, ttn: ret.ttn, status: result.status, delivered: result.isDelivered });
      } catch (e) {
        returnLog.push({ returnId: ret.id, ttn: ret.ttn, error: (e as Error).message });
      }
    }
  }

  return NextResponse.json({
    checked: log.length,
    updated: log.filter((l) => l.delivered).length,
    log,
    returnsChecked: returnLog.length,
    returnsUpdated: returnLog.filter((l) => l.delivered).length,
    returnLog,
  });
}
