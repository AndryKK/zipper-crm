-- Warehouse fill-level stats, aggregated in Postgres instead of pulled row-by-row
-- into the app (inventory now holds ~19.5k rows after the zero-stock seed).
-- Fill % is based on min_quantity (the reorder threshold), not initial_quantity —
-- the "Поч. залишок" field was dropped from the /warehouses "Add" form, so new
-- rows never carry a meaningful initial_quantity.
-- A plain (non-materialized) view always reflects the live inventory table, so
-- it updates automatically on every stock movement with no refresh step needed.
-- Run this once in the Supabase SQL editor.

CREATE OR REPLACE VIEW warehouse_stats AS
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
  COUNT(*) FILTER (WHERE i.quantity = 0)::int AS empty_count
FROM warehouses w
LEFT JOIN inventory i ON i.warehouse_id = w.id
GROUP BY w.id, w.title, w.address, w.priority, w.active;

GRANT SELECT ON warehouse_stats TO anon, authenticated, service_role;
