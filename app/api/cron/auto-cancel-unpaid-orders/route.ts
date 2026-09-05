import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { auth } from "@/lib/auth";
import { isPastPayment, isCancelledStatus } from "@/lib/order-status";

// An order that's sat unpaid for 10+ days auto-cancels — same rule a
// manager already applies by hand, just no longer dependent on someone
// remembering to check. Each order is set to "Скасовано" one row at a
// time (never a bulk UPDATE — see send-welcome-emails' own comment about
// the 2026-08-12 incident where an 18k-row bulk update fired the orders
// webhook trigger 18k times at once and took the DB down); the
// inventory-sync webhook reacts to that exact status transition and
// restocks the order's active items itself (isPreShipment(oldStatus) is
// true for every order this query can select, since isPastPayment/
// isCancelledStatus are excluded up front) — this route never touches
// inventory directly.
const UNPAID_DAYS_THRESHOLD = 10;
const BATCH_LIMIT = 50;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const isCron = process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`;
  if (!isCron) {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - UNPAID_DAYS_THRESHOLD);

  // Server-side status prefilter (not just a date filter) is required here —
  // without it this pulls every order older than 10 days ever placed
  // (20,000+), not just the still-unpaid handful actually being cancelled.
  const { data: candidates } = await supabaseServer
    .from("orders")
    .select("id, status, date, notes")
    .lte("date", cutoff.toISOString())
    .not("status", "ilike", "%оплач%")
    .not("status", "ilike", "%відправлен%")
    .not("status", "ilike", "%отправлен%")
    .not("status", "ilike", "%завершен%")
    .not("status", "ilike", "%скасован%")
    .not("status", "ilike", "%отмен%")
    .order("date", { ascending: true })
    .limit(BATCH_LIMIT);

  const log: { orderId: number; ok: boolean; error?: string }[] = [];

  for (const order of candidates ?? []) {
    // Belt-and-suspenders — the ilike prefilter above already excludes
    // these, but a NULL/empty status only matches isNewStatus, never the
    // ilike patterns, and this double-checks it's genuinely still unpaid
    // before cancelling anything.
    if (isPastPayment(order.status) || isCancelledStatus(order.status)) continue;

    try {
      const note = `[Автоматично скасовано ${new Date().toLocaleDateString("uk-UA")}]: не оплачено протягом ${UNPAID_DAYS_THRESHOLD} днів`;
      const notes = order.notes ? `${order.notes}\n${note}` : note;
      const { error } = await supabaseServer
        .from("orders")
        .update({ status: "Скасовано", notes })
        .eq("id", order.id);
      if (error) { log.push({ orderId: order.id, ok: false, error: error.message }); continue; }
      log.push({ orderId: order.id, ok: true });
    } catch (e) {
      log.push({ orderId: order.id, ok: false, error: (e as Error).message });
    }
  }

  return NextResponse.json({ checked: log.length, cancelled: log.filter((l) => l.ok).length, log });
}
