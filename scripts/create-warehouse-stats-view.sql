-- Warehouse fill-level stats, pre-computed once a day instead of aggregated
-- live on every request (inventory holds ~19.5k rows) or — worse — pulled
-- row-by-row into the app and reduced in JS, which is what made the
-- Залишки/Склади pages hang once real data was imported.
-- A MATERIALIZED view stores its result on disk; it does NOT reflect stock
-- changes until refreshed. Refreshed once a day here via pg_cron — the
-- numbers on the dashboard are "as of this morning", not live-to-the-second,
-- which is the deliberate trade-off for keeping these pages fast.
-- Run this once in the Supabase SQL editor (requires pg_cron, enabled below).

DROP VIEW IF EXISTS warehouse_stats;
DROP MATERIALIZED VIEW IF EXISTS warehouse_stats;

CREATE MATERIALIZED VIEW warehouse_stats AS
SELECT
  w.id,
  w.title,
  w.address,
  w.priority,
  w.active,
  COUNT(i.id)::int AS total_products,
  COALESCE(SUM(i.quantity), 0)::int AS total_qty,
  COALESCE(SUM(i.min_quantity), 0)::int AS total_min,
  CASE
    WHEN COALESCE(SUM(i.min_quantity), 0) > 0
    THEN LEAST(100, ROUND(SUM(i.quantity)::numeric / SUM(i.min_quantity) * 100))::int
    ELSE 0
  END AS fill_pct,
  COUNT(*) FILTER (WHERE i.min_quantity > 0 AND i.quantity <= i.min_quantity)::int AS low_stock,
  COUNT(*) FILTER (WHERE i.quantity > 0 AND (i.min_quantity = 0 OR i.quantity::numeric / i.min_quantity >= 0.7))::int AS full_count,
  COUNT(*) FILTER (WHERE i.quantity > 0 AND i.min_quantity > 0 AND i.quantity::numeric / i.min_quantity >= 0.3 AND i.quantity::numeric / i.min_quantity < 0.7)::int AS medium_count,
  COUNT(*) FILTER (WHERE i.quantity > 0 AND i.min_quantity > 0 AND i.quantity::numeric / i.min_quantity < 0.3)::int AS low_count,
  COUNT(*) FILTER (WHERE i.quantity = 0)::int AS empty_count,
  now() AS refreshed_at
FROM warehouses w
LEFT JOIN inventory i ON i.warehouse_id = w.id
GROUP BY w.id, w.title, w.address, w.priority, w.active;

-- Required for REFRESH ... CONCURRENTLY (lets reads continue during refresh).
CREATE UNIQUE INDEX warehouse_stats_id_idx ON warehouse_stats (id);

GRANT SELECT ON warehouse_stats TO anon, authenticated, service_role;

CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.schedule(
  'refresh-warehouse-stats',
  '0 5 * * *', -- 05:00 UTC daily
  'REFRESH MATERIALIZED VIEW CONCURRENTLY warehouse_stats'
);

-- One-time initial populate so the numbers aren't stale until tomorrow's run.
REFRESH MATERIALIZED VIEW warehouse_stats;
