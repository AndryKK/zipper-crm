-- Aggregates orders/revenue per time bucket per site, entirely in Postgres —
-- avoids pulling all order/order_item rows (96k+) into the Node runtime for
-- "весь час" (all-time) style dashboard queries, same lesson as
-- scripts/create-warehouse-stats-view.sql (aggregate server-side, not in JS).
--
-- Site attribution matches app/(admin)/orders/page.tsx's "Сайт" badge logic:
--   premium (Zipper Premium / zipper-new-shop) — user.password = 'SUPABASE_AUTH'
--   ru      (zipper.in.ua)  — orders.type = 'ru'
--   ua      (zipper.com.ua) — orders.type = 'uk'
CREATE OR REPLACE FUNCTION get_dashboard_chart_buckets(p_start timestamptz, p_bucket_unit text)
RETURNS TABLE (
  bucket timestamptz,
  site text,
  orders_count bigint,
  revenue numeric
) AS $$
  SELECT
    date_trunc(p_bucket_unit, o.date) AS bucket,
    CASE
      WHEN u.password = 'SUPABASE_AUTH' THEN 'premium'
      WHEN o.type = 'ru' THEN 'ru'
      WHEN o.type = 'uk' THEN 'ua'
      ELSE 'other'
    END AS site,
    count(DISTINCT o.id) AS orders_count,
    COALESCE(SUM(oi.price * oi.quantity), 0) AS revenue
  FROM orders o
  LEFT JOIN orders_item oi ON oi.oid = o.id
  LEFT JOIN users u ON u.login = o.login
  WHERE o.date >= p_start
  GROUP BY 1, 2
  ORDER BY 1;
$$ LANGUAGE sql STABLE;

GRANT EXECUTE ON FUNCTION get_dashboard_chart_buckets(timestamptz, text) TO anon, authenticated, service_role;
