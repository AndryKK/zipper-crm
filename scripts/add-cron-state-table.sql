-- Internal-only table (never read/written by either PHP storefront) that
-- tracks the last time each background-style job actually ran. Backs the
-- click-triggered "simulated hourly cron" for Nova Poshta status checks —
-- see app/api/orders/ttn-heartbeat/route.ts — since Vercel's Hobby plan
-- only allows a real cron (vercel.json) to fire once a day, which isn't
-- often enough for shipment-status freshness. A DB-backed timestamp (not
-- just each browser's localStorage) is what lets many different admins'
-- browsers agree on "has an hour actually passed since the last check",
-- rather than each browser independently believing it's the first to run.
CREATE TABLE IF NOT EXISTS cron_state (
  key TEXT PRIMARY KEY,
  last_run_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
