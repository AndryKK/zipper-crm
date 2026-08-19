import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { runTtnStatusSync } from "@/lib/ttn-status-sync";

// Nova Poshta has no webhook for third-party API keys, so this is a polling
// check: called once a day by Vercel Cron (see vercel.json — Authorization:
// Bearer $CRON_SECRET, added automatically by Vercel — Vercel's Hobby plan
// caps a true cron at once/day, which is why
// app/api/orders/ttn-heartbeat/route.ts also exists as a click-triggered,
// DB-rate-limited "simulated hourly cron" calling the same
// runTtnStatusSync), and also callable on-demand for a single order via the
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
  const onlyOrderId = searchParams.get("orderId") ?? undefined;
  const onlyReturnId = searchParams.get("returnId") ?? undefined;

  const result = await runTtnStatusSync({ onlyOrderId, onlyReturnId });
  if ("error" in result) return NextResponse.json(result, { status: 400 });
  return NextResponse.json(result);
}
