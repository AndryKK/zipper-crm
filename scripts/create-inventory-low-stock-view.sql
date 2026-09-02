-- "Під мінімумом" sidebar tab — a single list, across ALL warehouses, of
-- every inventory position currently at or below its own min_quantity
-- (same "under minimum" definition warehouse_stats.low_stock already uses:
-- min_quantity > 0 AND quantity <= min_quantity — a row with no minimum
-- set is never "under" anything).
--
-- Why a view instead of filtering in the API route: PostgREST's query
-- builder can't compare two columns of the same row against each other
-- (a plain .lte("quantity", "min_quantity") call sends "min_quantity" as a
-- literal string value, not a column reference — a well-known PostgREST
-- limitation). Doing the comparison in Postgres avoids fetching the whole
-- ~10k-row inventory table into the API route just to filter it in JS,
-- which CLAUDE.md's egress-hygiene rules explicitly ask this project to
-- avoid — same reasoning as warehouse_stats/top_selling_products/
-- category_product_counts (see scripts/create-warehouse-stats-view.sql).
--
-- Flattens the product/warehouse join into plain columns rather than
-- relying on PostgREST's `table!fkey(...)` embedding syntax — views don't
-- carry the FK metadata that syntax needs, so app/api/inventory/route.ts's
-- embedding trick doesn't carry over here; the API route for this view
-- reads these flat columns directly instead.
CREATE OR REPLACE VIEW inventory_low_stock AS
SELECT
  i.id,
  i.product_id,
  i.warehouse_id,
  i.quantity,
  i.reserved,
  i.initial_quantity,
  i.min_quantity,
  i.updated_at,
  p.title AS product_title,
  p.pcode AS product_pcode,
  p.lang AS product_lang,
  p.img AS product_img,
  p.uri AS product_uri,
  p.translation_id AS product_translation_id,
  w.title AS warehouse_title
FROM inventory i
JOIN products p ON p.id = i.product_id
JOIN warehouses w ON w.id = i.warehouse_id
WHERE i.min_quantity > 0 AND i.quantity <= i.min_quantity;

GRANT SELECT ON inventory_low_stock TO anon, authenticated, service_role;
