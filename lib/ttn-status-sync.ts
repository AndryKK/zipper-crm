import { supabaseServer } from "@/lib/supabase";
import { npGetStatus } from "@/lib/nova-poshta";
import { RETURN_STATUS } from "@/lib/returns";
import { revalidateTag } from "next/cache";

function getSetting(settings: { value: string; text: string }[], key: string) {
  return settings.find((s) => s.value === key)?.text?.trim() ?? "";
}

export type TtnStatusSyncResult = {
  checked: number;
  updated: number;
  log: { orderId: number; ttn: string; status?: string; delivered?: boolean; reverted?: boolean; promoted?: boolean; error?: string }[];
  returnsChecked: number;
  returnsUpdated: number;
  returnLog: { returnId: number; ttn: string; status?: string; delivered?: boolean; error?: string }[];
};

// The actual Nova Poshta status poll — extracted out of
// app/api/cron/sync-ttn-status/route.ts so both the daily Vercel cron (that
// route, still auth-gated by CRON_SECRET/session there) and the
// click-triggered "simulate an hourly cron" heartbeat
// (app/api/orders/ttn-heartbeat/route.ts, needed because Vercel's Hobby
// plan only allows a cron to fire once a day — see vercel.json) call the
// exact same logic instead of two copies drifting apart. See that route's
// own doc comment for the on-demand single-order/return scoping this
// still supports via `onlyOrderId`/`onlyReturnId`.
export async function runTtnStatusSync(opts: { onlyOrderId?: string; onlyReturnId?: string } = {}): Promise<TtnStatusSyncResult | { error: string }> {
  const { onlyOrderId, onlyReturnId } = opts;

  const { data: allSettings } = await supabaseServer.from("settings").select("value, text");
  const settings = allSettings ?? [];
  const apiKey = getSetting(settings, "np_api_key") || process.env.NOVA_POSHTA_API_KEY || "";
  if (!apiKey) return { error: "np_api_key не налаштовано" };

  const log: TtnStatusSyncResult["log"] = [];
  const returnLog: TtnStatusSyncResult["returnLog"] = [];

  if (!onlyReturnId) {
    // Also checks "Оплачено" orders with a ttn, not just "Відправлено" —
    // a real gap found via order 20808: a TTN gets created against an
    // "Оплачено" order, but nothing ever marks the order "Відправлено"
    // automatically (deliberately — see notHandedOver's doc comment in
    // lib/nova-poshta.ts, a TTN existing isn't proof it was actually
    // handed over). That left a manager's own "Позначити відправленим"
    // click as the ONLY way an order ever reaches "Відправлено" — if they
    // forget, the order stayed invisible to this whole sync forever, no
    // matter how often it ran, even after Nova Poshta had genuinely
    // confirmed real movement (20808 sat at "Оплачено" while NP already
    // showed StatusCode 8, "Прибув до поштомату" — physically at the
    // destination). Now: any real NP movement (not notHandedOver) on an
    // "Оплачено" order promotes it to "Відправлено" here instead of
    // waiting on a human to notice.
    let query = supabaseServer.from("orders").select("id, status, ttn, phone").in("status", ["Оплачено", "Відправлено"]).not("ttn", "is", null);
    if (onlyOrderId) query = query.eq("id", parseInt(onlyOrderId));
    const { data: orders } = await query;

    for (const order of orders ?? []) {
      try {
        const result = await npGetStatus(apiKey, order.ttn, order.phone ?? undefined);
        if (!result) { log.push({ orderId: order.id, ttn: order.ttn, error: "Немає відповіді від НП" }); continue; }
        let reverted = false;
        let promoted = false;
        if (result.isDelivered) {
          // "Отримано" used to be a separate step with a further manual/14-day
          // wait before "Завершено" — merged into one: once NP confirms
          // delivery, the order is done, no extra step needed.
          await supabaseServer.from("orders").update({ status: "Завершено" }).eq("id", order.id);
        } else if (result.notHandedOver) {
          // The TTN exists but NP itself says nothing has actually shipped
          // (no branch/courier scan yet) — "Відправлено" here was premature
          // (created but never physically dropped off), so it belongs back
          // at "Оплачено" (paid, awaiting shipment) rather than staying
          // marked as shipped. The TTN itself is left alone — it's still a
          // real, valid waybill, just not handed over yet. A no-op for an
          // order already at "Оплачено".
          if (order.status !== "Оплачено") {
            await supabaseServer.from("orders").update({ status: "Оплачено" }).eq("id", order.id);
            reverted = true;
          }
        } else if (order.status === "Оплачено") {
          // Neither delivered nor "not handed over" — genuine in-transit
          // movement Nova Poshta has confirmed, so the order really is
          // shipped even though nobody clicked the button for it.
          await supabaseServer.from("orders").update({ status: "Відправлено" }).eq("id", order.id);
          promoted = true;
        }
        log.push({ orderId: order.id, ttn: order.ttn, status: result.status, delivered: result.isDelivered, reverted, promoted });
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

  // Cheap regardless of how often this runs — simpler and just as correct
  // to invalidate unconditionally here than to track exactly which branch
  // above actually changed a status.
  revalidateTag("sidebar-counts", { expire: 0 });

  return {
    checked: log.length,
    updated: log.filter((l) => l.delivered).length,
    log,
    returnsChecked: returnLog.length,
    returnsUpdated: returnLog.filter((l) => l.delivered).length,
    returnLog,
  };
}
