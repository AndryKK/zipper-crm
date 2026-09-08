-- Daily JSON snapshot of every product's current warehouse quantity —
-- requested after the 2026-09-08 full inventory reset, so the fresh
-- re-count being entered from a clean slate has a running end-of-day
-- backup to recover from (a real .json file in R2, plus a queryable copy
-- here). One row per calendar day; a re-run on the same day overwrites
-- that day's row rather than duplicating it (see the cron's own upsert).
CREATE TABLE IF NOT EXISTS inventory_daily_backups (
  id BIGSERIAL PRIMARY KEY,
  backup_date DATE NOT NULL UNIQUE,
  -- Shape: {"all": [{"z10236": 1000}, {"xt23581": 5400}, ...]} — one
  -- {pcode: quantity} object per product with any stock recorded that
  -- day, quantity summed across every warehouse (see the cron route for
  -- why: the ask was "current quantity" per product, not a per-warehouse
  -- breakdown).
  data JSONB NOT NULL,
  r2_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON inventory_daily_backups TO anon, authenticated, service_role;
