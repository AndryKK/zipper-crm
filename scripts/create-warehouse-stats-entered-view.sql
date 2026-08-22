-- Same shape as warehouse_stats (see create-warehouse-stats-view.sql), but
-- counting only inventory rows that have actually been manually entered at
-- least once (initial_quantity > 0 — set by a "Змінити"/"Поставка"/"Додати
-- запис" save, see app/api/inventory/route.ts's PUT/POST handlers). Rows
-- with initial_quantity = 0 only exist because adjustInventory() (the
-- webhook-driven auto-deduct/restock path for orders/returns) inserted a
-- bare row with no real recorded stock behind it yet — the exact same
-- "не введені позиції" case the /inventory page's own hide-unentered
-- toggle already excludes. This view lets /warehouses' banners reflect the
-- same "only what's actually been counted" view when that toggle is on,
-- instead of a fill % dragged down by thousands of never-touched rows.
--
-- The filter lives in the JOIN condition, not a WHERE clause — a WHERE
-- filter after a LEFT JOIN would behave like an INNER JOIN (dropping any
-- warehouse with zero entered rows entirely); keeping it in the ON clause
-- preserves LEFT JOIN semantics so such a warehouse still shows up with 0s.
--
-- Run this once in the Supabase SQL editor.

DROP VIEW IF EXISTS warehouse_stats_entered;

CREATE VIEW warehouse_stats_entered AS
SELECT
  w.id,
  w.title,
  w.address,
  w.priority,
  w.active,
  COUNT(i.id)::int AS total_products,
  COALESCE(SUM(GREATEST(i.quantity, 0)), 0)::int AS total_qty,
  COALESCE(SUM(i.min_quantity), 0)::int AS total_min,
  COALESCE(ROUND(AVG(
    CASE
      WHEN i.initial_quantity > 0 THEN LEAST(100, GREATEST(i.quantity, 0)::numeric / i.initial_quantity * 100)
      WHEN GREATEST(i.quantity, 0) > 0 THEN 100
      ELSE 0
    END
  )), 0)::int AS fill_pct,
  COUNT(*) FILTER (WHERE i.min_quantity > 0 AND i.quantity <= i.min_quantity)::int AS low_stock,
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
LEFT JOIN inventory i ON i.warehouse_id = w.id AND i.initial_quantity > 0
GROUP BY w.id, w.title, w.address, w.priority, w.active;

GRANT SELECT ON warehouse_stats_entered TO anon, authenticated, service_role;
