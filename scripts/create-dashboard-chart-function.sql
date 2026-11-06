-- Aggregates orders/revenue per time bucket per site, entirely in Postgres —
-- avoids pulling all order/order_item rows (96k+) into the Node runtime for
-- "весь час" (all-time) style dashboard queries, same lesson as
-- scripts/create-warehouse-stats-view.sql (aggregate server-side, not in JS).
--
-- Site attribution matches app/(admin)/orders/page.tsx's "Сайт" badge logic:
--   ru      (zipper.in.ua)  — orders.type = 'ru'
--   ua      (zipper.com.ua) — orders.type = 'uk'
--   premium (Zipper Premium / zipper-new-shop) — orders.type = 'premium',
--           set directly by that storefront's own checkout.
-- Used to fall back to user.password = 'SUPABASE_AUTH' (that storefront's
-- old Supabase-Auth-based signup marker) for orders with neither type —
-- removed along with the rest of the classic/premium *user* split now that
-- customer accounts are fully shared across all three sites, and that
-- checkout always stamps 'premium' on its own orders directly, leaving
-- nothing for the fallback to catch.
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
      WHEN o.type = 'premium' THEN 'premium'
      ELSE 'other'
    END AS site,
    count(DISTINCT o.id) AS orders_count,
    COALESCE(SUM(oi.price * oi.quantity), 0) AS revenue
  FROM orders o
  LEFT JOIN orders_item oi ON oi.oid = o.id
  WHERE o.date >= p_start
  GROUP BY 1, 2
  ORDER BY 1;
$$ LANGUAGE sql STABLE;

GRANT EXECUTE ON FUNCTION get_dashboard_chart_buckets(timestamptz, text) TO anon, authenticated, service_role;
