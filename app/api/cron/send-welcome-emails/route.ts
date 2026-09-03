import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { auth } from "@/lib/auth";
import { sendWelcomeEmail } from "@/lib/order-emails";
import { isGuestCheckoutEmail } from "@/lib/guest-checkout";

// SAFETY NET, not the primary send path — the real-time send happens
// immediately via the Supabase Database Webhook on `orders` INSERT (see
// app/api/webhooks/inventory-sync's "orders"+"INSERT" branch). That's what
// actually fires the moment a new order lands; this cron only exists to
// catch the rare straggler the webhook missed (misconfigured trigger,
// transient failure, invalid email retried after being fixed, etc).
//
// A minute-level schedule was tried first but Vercel silently dropped the
// cron registration for it (Hobby-plan accounts cap cron at once/day —
// confirmed by the route 404ing in production despite deploying fine), so
// this now runs once daily instead. That's fine for a safety net; it would
// NOT be fine as the only send path, which is why the webhook exists.
//
// Capped at a small batch per run — after the 2026-08-12 incident where an
// 18k-row bulk UPDATE on `orders` fired its webhook trigger 18k times at
// once and took the DB down, this cron must never be the thing that fires
// that same orders-UPDATE webhook in a burst. A handful of individual
// row updates, once a day, is nowhere near that scale.
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
    .limit(10);
  if (onlyOrderId) query = query.eq("id", parseInt(onlyOrderId));
  const { data: orders } = await query;

  const log: { orderId: number; ok: boolean; error?: string }[] = [];

  for (const order of orders ?? []) {
    try {
      // Same guest-checkout skip as the primary webhook send path — see
      // its own comment in app/api/webhooks/inventory-sync/route.ts.
      // Without this, an order under the shared placeholder login would
      // never succeed and this "safety net" would keep re-selecting it
      // (welcome_email_sent stuck false) on every single daily run.
      if (isGuestCheckoutEmail(order.login)) {
        await supabaseServer
          .from("orders")
          .update({ welcome_email_sent: true, welcome_email_sent_at: new Date().toISOString() })
          .eq("id", order.id);
        log.push({ orderId: order.id, ok: true });
        continue;
      }
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
