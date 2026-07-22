-- Warehouse fill-level stats.
--
-- Was previously a MATERIALIZED view refreshed once a day via pg_cron —
-- fine for the ~19.5k-row inventory table this was designed for, but a
-- daily refresh means edits (manual or from live orders) don't show up
-- until the next morning, which read as "the numbers are just wrong"
-- (2026-07-22: Підкова showed a stale 100 total while the real, current sum
-- was already 800). After the 2026-07-22 ru/uk merge, inventory is down to
-- ~9.9k rows, cheap enough for Postgres to aggregate live on every request
-- (a plain GROUP BY over warehouse_id, no cross joins) — so this is now a
-- regular VIEW instead: always current, no cron, no staleness possible.
-- Run this once in the Supabase SQL editor.

-- Drops warehouse_stats regardless of its current kind (materialized view,
-- plain view, or not present) — DROP VIEW/DROP MATERIALIZED VIEW both error
-- on IF EXISTS when an object of that name exists but is the wrong kind, so
-- a plain "DROP VIEW IF EXISTS" isn't safe to just re-run unconditionally.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'warehouse_stats' AND relkind = 'm') THEN
    DROP MATERIALIZED VIEW warehouse_stats;
  ELSIF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'warehouse_stats' AND relkind = 'v') THEN
    DROP VIEW warehouse_stats;
  END IF;
END $$;

-- One-time cleanup: the old materialized view's daily refresh job is no
-- longer needed now that this is a live view.
SELECT cron.unschedule('refresh-warehouse-stats') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'refresh-warehouse-stats'
);

CREATE VIEW warehouse_stats AS
SELECT
  w.id,
  w.title,
  w.address,
  w.priority,
  w.active,
  COUNT(i.id)::int AS total_products,
  -- Negative quantity means a product was oversold/over-reserved past what
  -- was counted — it's a deficit to fix, not "negative physical units", so
  -- it must not subtract from other products' very real on-hand stock when
  -- summed. Clamped to 0 per row before summing.
  COALESCE(SUM(GREATEST(i.quantity, 0)), 0)::int AS total_qty,
  COALESCE(SUM(i.min_quantity), 0)::int AS total_min,
  -- Fill % is the AVERAGE of each product's own fill % — NOT
  -- SUM(quantity)/SUM(initial_quantity). That ratio is quantity-weighted:
  -- one product with a huge initial_quantity sitting at 100% can single-
  -- handedly drag the whole warehouse's number up to 100% even when
  -- thousands of other positions are sitting at 0%, which is exactly
  -- backwards — it should read as "on average, how full are my positions",
  -- treating every product equally regardless of size. Per-product % is
  -- against initial_quantity (the stock level as of the last manual entry —
  -- see lib/inventory.ts), NOT min_quantity (the critical/reorder
  -- threshold — "100% of minimum" would misleadingly read as "full" right
  -- at the point stock is already critically low). Negative (oversold)
  -- quantity is clamped to 0, same reasoning as total_qty above.
  COALESCE(ROUND(AVG(
    CASE
      WHEN i.initial_quantity > 0 THEN LEAST(100, GREATEST(i.quantity, 0)::numeric / i.initial_quantity * 100)
      WHEN GREATEST(i.quantity, 0) > 0 THEN 100
      ELSE 0
    END
  )), 0)::int AS fill_pct,
  COUNT(*) FILTER (WHERE i.min_quantity > 0 AND i.quantity <= i.min_quantity)::int AS low_stock,
  -- A product at/below min_quantity is critical — it must never land in
  -- "full"/"medium" just because it happens to equal 100% of its OWN
  -- initial_quantity baseline (e.g. it was only ever manually stocked to a
  -- level that was already below the reorder threshold). "Under minimum"
  -- always wins over the fill-% bucket, same as low_stock above. Same
  -- clamping as total_qty/fill_pct above for the oversold (negative) case.
  COUNT(*) FILTER (
    WHERE GREATEST(i.quantity, 0) > 0
      AND NOT (i.min_quantity > 0 AND i.quantity <= i.min_quantity)
      AND (i.initial_quantity = 0 OR GREATEST(i.quantity, 0)::numeric / i.initial_quantity >= 0.7)
  )::int AS full_count,
  COUNT(*) FILTER (
    WHERE GREATEST(i.quantity, 0) > 0
      AND NOT (i.min_quantity > 0 AND i.quantity <= i.min_quantity)
      AND i.initial_quantity > 0
      AND GREATEST(i.quantity, 0)::numeric / i.initial_quantity >= 0.3
      AND GREATEST(i.quantity, 0)::numeric / i.initial_quantity < 0.7
  )::int AS medium_count,
  COUNT(*) FILTER (
    WHERE GREATEST(i.quantity, 0) > 0
      AND (
        (i.min_quantity > 0 AND i.quantity <= i.min_quantity)
        OR (i.initial_quantity > 0 AND GREATEST(i.quantity, 0)::numeric / i.initial_quantity < 0.3)
      )
  )::int AS low_count,
  COUNT(*) FILTER (WHERE GREATEST(i.quantity, 0) = 0)::int AS empty_count,
  now() AS refreshed_at
FROM warehouses w
LEFT JOIN inventory i ON i.warehouse_id = w.id
GROUP BY w.id, w.title, w.address, w.priority, w.active;

GRANT SELECT ON warehouse_stats TO anon, authenticated, service_role;
