import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { auth } from "@/lib/auth";
import { sendWelcomeEmail } from "@/lib/order-emails";

// Orders always arrive already-created from the storefront (this CRM never
// creates one itself), so there's no in-app event to hang an "order placed"
// email off of — this cron polls for orders that haven't gotten their
// one-time "order received, checking stock" greeting yet (welcome_email_sent
// = false) and sends it, same pattern as sync-ttn-status polling Nova
// Poshta. See scripts/add-welcome-email-sent-column.sql for why existing
// orders are excluded (backfilled to true) and only new ones show up here.
//
// Deliberately capped at ONE order per run (paired with the every-minute
// vercel.json schedule, so throughput is ~1/min) — after the 2026-08-12
// incident where an 18k-row bulk UPDATE on `orders` fired its webhook
// trigger 18k times at once and took the DB down, this cron must never be
// the thing that fires that same orders-UPDATE webhook in a burst. One
// row updated per run, a full cron tick apart, is exactly the same
// single-row-update shape every other order-status change already does
// safely elsewhere in this app — just paced, never batched.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const isCron = process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`;
  if (!isCron) {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const onlyOrderId = searchParams.get("orderId");

  let query = supabaseServer
    .from("orders")
    .select("id, login")
    .eq("welcome_email_sent", false)
    .order("date", { ascending: true })
    .limit(1);
  if (onlyOrderId) query = query.eq("id", parseInt(onlyOrderId));
  const { data: orders } = await query;

  const log: { orderId: number; ok: boolean; error?: string }[] = [];

  for (const order of orders ?? []) {
    try {
      const result = await sendWelcomeEmail(order.id);
      if (result.ok) {
        await supabaseServer
          .from("orders")
          .update({ welcome_email_sent: true, welcome_email_sent_at: new Date().toISOString() })
          .eq("id", order.id);
        log.push({ orderId: order.id, ok: true });
      } else {
        log.push({ orderId: order.id, ok: false, error: result.error });
      }
    } catch (e) {
      log.push({ orderId: order.id, ok: false, error: (e as Error).message });
    }
  }

  return NextResponse.json({ checked: log.length, sent: log.filter((l) => l.ok).length, log });
}
