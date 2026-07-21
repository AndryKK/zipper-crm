import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { auth } from "@/lib/auth";
import { npGetStatus } from "@/lib/nova-poshta";

function getSetting(settings: { value: string; text: string }[], key: string) {
  return settings.find((s) => s.value === key)?.text?.trim() ?? "";
}

// Nova Poshta has no webhook for third-party API keys, so this is a polling
// check: called once a day by Vercel Cron (see vercel.json — Authorization:
// Bearer $CRON_SECRET, added automatically by Vercel) for every order stuck
// at "Відправлено", and also callable on-demand for a single order via the
// "Перевірити статус НП" button on the order page (admin session instead).
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const isCron = process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`;
  if (!isCron) {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const onlyOrderId = searchParams.get("orderId");

  const { data: allSettings } = await supabaseServer.from("settings").select("value, text");
  const settings = allSettings ?? [];
  const apiKey = getSetting(settings, "np_api_key") || process.env.NOVA_POSHTA_API_KEY || "";
  if (!apiKey) return NextResponse.json({ error: "np_api_key не налаштовано" }, { status: 400 });

  let query = supabaseServer.from("orders").select("id, ttn, phone").eq("status", "Відправлено").not("ttn", "is", null);
  if (onlyOrderId) query = query.eq("id", parseInt(onlyOrderId));
  const { data: orders } = await query;

  const log: { orderId: number; ttn: string; status?: string; delivered?: boolean; error?: string }[] = [];

  for (const order of orders ?? []) {
    try {
      const result = await npGetStatus(apiKey, order.ttn, order.phone ?? undefined);
      if (!result) { log.push({ orderId: order.id, ttn: order.ttn, error: "Немає відповіді від НП" }); continue; }
      if (result.isDelivered) {
        await supabaseServer.from("orders").update({ status: "Отримано" }).eq("id", order.id);
      }
      log.push({ orderId: order.id, ttn: order.ttn, status: result.status, delivered: result.isDelivered });
    } catch (e) {
      log.push({ orderId: order.id, ttn: order.ttn, error: (e as Error).message });
    }
  }

  return NextResponse.json({ checked: log.length, updated: log.filter((l) => l.delivered).length, log });
}
