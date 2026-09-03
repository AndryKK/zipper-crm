-- Replaces the static top_selling_products view (all-time, no filters) with
-- a parameterized function so /top-sales can offer a period selector
-- (весь час/рік/місяць/тиждень) and exclude specific logins (emails) from
-- the ranking — both still aggregated in Postgres, not client-side, same
-- reasoning as the original view (see create-top-selling-products-view.sql).
--
-- Also fixes a latent bug found while rewriting this: the old view summed
-- ALL orders_item rows including active=false ones (soft-removed line
-- items — see scripts/add-orders-item-active-column.sql), so a removed
-- item still counted toward a product's "sold" total. Only 9/97456 rows
-- are active=false today, but it was still wrong.
--
-- p_excluded_logins is matched against orders.login (which IS the
-- customer's email for this storefront — see users.login) — populated
-- from the settings row `top_sales_excluded_emails`
-- (app/(admin)/settings/page.tsx), superadmin-only.
CREATE OR REPLACE FUNCTION top_selling_products_by_period(
  p_period text DEFAULT 'all',
  p_excluded_logins text[] DEFAULT '{}'
)
RETURNS TABLE(product integer, total_quantity numeric, total_revenue numeric)
LANGUAGE sql STABLE AS $$
  SELECT oi.product,
         SUM(oi.quantity)::numeric AS total_quantity,
         SUM(oi.price * oi.quantity)::numeric AS total_revenue
  FROM orders_item oi
  JOIN orders o ON o.id = oi.oid
  WHERE oi.active
    AND (
      p_period = 'all'
      OR (p_period = 'year' AND o.date >= now() - interval '1 year')
      OR (p_period = 'month' AND o.date >= now() - interval '1 month')
      OR (p_period = 'week' AND o.date >= now() - interval '1 week')
    )
    AND (
      o.login IS NULL
      OR NOT (lower(o.login) = ANY (SELECT lower(x) FROM unnest(p_excluded_logins) AS x))
    )
  GROUP BY oi.product
  ORDER BY total_quantity DESC
  LIMIT 30
$$;

GRANT EXECUTE ON FUNCTION top_selling_products_by_period(text, text[]) TO anon, authenticated, service_role;
