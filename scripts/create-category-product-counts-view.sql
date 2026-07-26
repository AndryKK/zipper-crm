-- Product-count-per-category, aggregated in Postgres.
--
-- The categories admin page previously ran one HEAD-count request PER
-- CATEGORY (~150-160 separate round-trips to /rest/v1/products_categories
-- on every single page load, force-dynamic so never cached) just to show
-- "N товарів" next to each row in the tree. That fan-out was the single
-- largest contributor to this project's Supabase egress usage. A live view
-- (same reasoning as warehouse_stats — cheap enough to GROUP BY on every
-- request, no cron, never stale) replaces it with exactly one query.
--
-- products_categories.cid = categories.translation_id for every row
-- (confirmed against the live site's catalog.php query and by direct
-- sampling — see app/(admin)/products/product-form.tsx's getCategoryPath).
CREATE OR REPLACE VIEW category_product_counts AS
SELECT cid AS translation_id, COUNT(*)::int AS product_count
FROM products_categories
GROUP BY cid;

GRANT SELECT ON category_product_counts TO anon, authenticated, service_role;
