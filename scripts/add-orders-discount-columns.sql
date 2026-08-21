-- Per-order client discount (manager-editable override of the client's
-- own rank-based discount from users_categories.discount) and a flag
-- marking orders_item rows a manager added/changed via the CRM after the
-- order was originally placed (as opposed to the customer's own checkout
-- submission) — see lib/pricing.ts and app/api/orders/[id]/process/route.ts.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_percent NUMERIC;
ALTER TABLE orders_item ADD COLUMN IF NOT EXISTS added_by_admin BOOLEAN NOT NULL DEFAULT false;
