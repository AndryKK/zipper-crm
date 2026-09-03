-- Factory suppliers list (Налаштування → Фабрики, superadmin-only — the
-- page itself is already gated for every other role by lib/roles.ts, see
-- isPathAllowed) + products.factory_id, which factory a product is
-- sourced from.
--
-- factory_id is set once by whichever role first assigns it (any role that
-- can reach /inventory), then locked to superadmin-only changes — that
-- rule lives in app/api/products/[id]/factory/route.ts, not here.
CREATE TABLE IF NOT EXISTS factories (
  id serial PRIMARY KEY,
  title text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE products ADD COLUMN IF NOT EXISTS factory_id integer REFERENCES factories(id) ON DELETE SET NULL;
