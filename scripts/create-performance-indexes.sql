-- Missing indexes on columns this CRM filters/sorts/joins by constantly.
-- None of these existed before (checked live row counts first — largest is
-- orders_item at ~97k rows, orders at ~20k — small enough that a plain
-- CREATE INDEX locks each table for a fraction of a second, not worth the
-- CONCURRENTLY dance). All idempotent (IF NOT EXISTS) and purely additive —
-- safe to re-run, nothing to roll back if wrong other than DROP INDEX.

-- orders.date is the ORDER BY column on nearly every admin page that
-- touches orders (the /orders list, the dashboard's recent-orders and
-- 30-day chart queries) — every one of those was sorting/ranging over the
-- full ~20k-row table with no index to walk.
CREATE INDEX IF NOT EXISTS idx_orders_date ON orders (date DESC);
-- /orders' status filter (?status=...) and the dashboard's "Нове" count.
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders (status);
-- /users' per-customer order counts (user_order_counts view's GROUP BY
-- login) and orders' own login-based search.
CREATE INDEX IF NOT EXISTS idx_orders_login ON orders (login);

-- orders_item.oid has an FK constraint (references orders.id) but Postgres
-- does NOT automatically index FK columns — "all items for these order
-- ids" is one of the single most frequent queries in the app (orders
-- list, dashboard, order detail, legacy-return resolution), all running
-- against a ~97k-row table with no index on the join key until now.
CREATE INDEX IF NOT EXISTS idx_orders_item_oid ON orders_item (oid);

-- products_categories.cid: the existing @@unique(pid, cid) constraint's
-- index has pid as its leading column, so it can't efficiently serve
-- cid-only lookups (category product counts, "products in category X"
-- filtering) — the root cause of the ~150-160-request N+1 fixed at the
-- application layer earlier this session; this closes the same gap at
-- the database layer so the replacement single-query view is fast too.
CREATE INDEX IF NOT EXISTS idx_products_categories_cid ON products_categories (cid);

-- all_filters_items: same shape as above — @@unique(cid, fid) only
-- covers cid-first lookups, but the filter-group-side "which categories
-- show this filter" picker (added this session) filters by fid alone.
CREATE INDEX IF NOT EXISTS idx_all_filters_items_fid ON all_filters_items (fid);

-- all_filters_filters.pid has no index or unique constraint at all,
-- despite being filtered via .in(pid, ...) on every product edit/create
-- page load to build the filter-value picker.
CREATE INDEX IF NOT EXISTS idx_all_filters_filters_pid ON all_filters_filters (pid);

-- categories.pid drives every category-tree build (admin categories page,
-- product-form's category cascade dropdowns, the /filters category popup)
-- via a group-by-parent walk over all 276 rows.
CREATE INDEX IF NOT EXISTS idx_categories_pid ON categories (pid);
