"use client";

// Client half of the "simulate an hourly cron via clicks" system — see
// app/api/orders/ttn-heartbeat/route.ts's doc comment for the full picture.
// Called from components/admin/sidebar.tsx on every navigation. This local
// check exists purely to avoid a network round-trip on every single click:
// the DB (via the heartbeat endpoint) is still the actual source of truth
// for whether an hour has really passed, since many different browsers are
// all doing this independently and can't trust each other's localStorage.
const STORAGE_KEY = "ttn-sync-last-check";
const HOUR_MS = 60 * 60 * 1000;

export function maybeCheckTtnStatus() {
  if (typeof window === "undefined") return;

  const lastLocal = Number(localStorage.getItem(STORAGE_KEY) ?? 0);
  if (Date.now() - lastLocal < HOUR_MS) return;

  // keepalive so the request survives the navigation that triggered it —
  // this is deliberately fire-and-forget, never awaited by the caller, so
  // it can't add latency to a sidebar click.
  fetch("/api/orders/ttn-heartbeat", { method: "POST", keepalive: true })
    .then((res) => (res.ok ? res.json() : null))
    .then((data: { ran?: boolean; lastRunAt?: string } | null) => {
      if (!data?.lastRunAt) return;
      // Whether we were the one who actually ran it (ran: true) or the DB
      // says someone else already did within the hour (ran: false), the
      // real last_run_at from the server is what localStorage should
      // reflect — this is the "sync local storage to the DB's time" step.
      localStorage.setItem(STORAGE_KEY, String(new Date(data.lastRunAt).getTime()));
    })
    .catch(() => {
      // Best-effort only — a logged-in-but-role-restricted admin (no
      // /api/orders access) or a network hiccup should never surface an
      // error for what's just a background freshness check.
    });
}
