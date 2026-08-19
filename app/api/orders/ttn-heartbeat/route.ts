import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { auth } from "@/lib/auth";
import { runTtnStatusSync } from "@/lib/ttn-status-sync";

const KEY = "sync-ttn-status";
const HOUR_MS = 60 * 60 * 1000;

// POST /api/orders/ttn-heartbeat
//
// Vercel's Hobby plan only allows the real cron (vercel.json,
// /api/cron/sync-ttn-status) to fire once a day, which leaves shipment
// statuses stale for up to 24h. This route lets the CRM's own client
// simulate a much more frequent cron by piggy-backing on normal admin
// activity: the client (see components/admin/sidebar.tsx's navigate())
// calls this on every navigation, but only after its own localStorage
// timestamp says an hour has passed — cutting out most of the network
// calls before they ever reach here.
//
// The real gate is this table (cron_state), not localStorage: many
// different browsers/admins are all triggering this independently, so
// only a DB-backed "has an hour passed since the last ACTUAL run"
// check (not each browser's own belief) can stop them all from running
// the sync at once. When this row says the hour hasn't passed yet, we
// hand back its real last_run_at so the caller's localStorage can
// resync to it instead of re-asking on every subsequent click.
export async function POST() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cutoffIso = new Date(Date.now() - HOUR_MS).toISOString();
  const nowIso = new Date().toISOString();

  const { data: row } = await supabaseServer.from("cron_state").select("last_run_at").eq("key", KEY).maybeSingle();

  if (row && row.last_run_at > cutoffIso) {
    return NextResponse.json({ ran: false, lastRunAt: row.last_run_at });
  }

  // Claim the slot before doing any work, so a near-simultaneous second
  // request sees the fresh timestamp and backs off. Not airtight against a
  // dead-heat race (two requests both reading the stale row in the same
  // instant) — that just means one extra Nova Poshta sweep runs, not any
  // data corruption, so it's an acceptable tradeoff against the complexity
  // a fully atomic claim (a Postgres function) would add for this.
  await supabaseServer.from("cron_state").upsert({ key: KEY, last_run_at: nowIso }, { onConflict: "key" });

  const result = await runTtnStatusSync();
  if ("error" in result) return NextResponse.json({ ran: true, lastRunAt: nowIso, error: result.error }, { status: 200 });
  return NextResponse.json({ ran: true, lastRunAt: nowIso, result });
}
