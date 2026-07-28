-- Top-selling products, aggregated in Postgres.
--
-- /top-sales previously fetched the ENTIRE orders_item table (product,
-- quantity, price for every line item ever placed, no WHERE clause, no
-- LIMIT) on every single page view — force-dynamic, so never cached — just
-- to sum quantities per product and keep the top 30 client-side. Same
-- "whole table re-transferred on every load" shape as the categories N+1,
-- warehouse_stats, and user_order_counts before their fixes; this was the
-- single largest full-table scan found in the app. A live GROUP BY view
-- (same reasoning: cheap enough to aggregate on every request, no cron, no
-- staleness) shrinks this to the 30 rows the page actually shows.
CREATE OR REPLACE VIEW top_selling_products AS
SELECT
  product,
  SUM(quantity)::numeric AS total_quantity,
  SUM(price * quantity)::numeric AS total_revenue
FROM orders_item
GROUP BY product
ORDER BY total_quantity DESC
LIMIT 30;

GRANT SELECT ON top_selling_products TO anon, authenticated, service_role;
