-- Aggregates orders/revenue per time bucket per site, entirely in Postgres —
-- avoids pulling all order/order_item rows (96k+) into the Node runtime for
-- "весь час" (all-time) style dashboard queries, same lesson as
-- scripts/create-warehouse-stats-view.sql (aggregate server-side, not in JS).
--
-- Site attribution matches app/(admin)/orders/page.tsx's "Сайт" badge logic:
--   ru      (zipper.in.ua)  — orders.type = 'ru'
--   ua      (zipper.com.ua) — orders.type = 'uk'
--   premium (Zipper Premium / zipper-new-shop) — user.password = 'SUPABASE_AUTH',
--           only when the order's own type is neither 'ru' nor 'uk' — a
--           customer can have a Premium account and still place an order on
--           the regular RU/UA storefronts, which should count as RU/UA, not
--           Premium.
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
      WHEN o.type = 'ru' THEN 'ru'
      WHEN o.type = 'uk' THEN 'ua'
      WHEN u.password = 'SUPABASE_AUTH' THEN 'premium'
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
