-- Recreates the 4 views missing from the new project, matching the source project exactly.
-- filters_cat_items depends on all_filters_filters_items, a legacy table (1 placeholder
-- row, unreferenced in app code) that wasn't part of the schema.prisma clone, so it's
-- created here too.

CREATE TABLE IF NOT EXISTS "all_filters_filters_items" (
  id  serial PRIMARY KEY,
  fid integer NOT NULL DEFAULT 0,
  pid integer NOT NULL DEFAULT 0
);

INSERT INTO "all_filters_filters_items" (id, fid, pid) VALUES (1, 1, 1) ON CONFLICT (id) DO NOTHING;
SELECT setval(pg_get_serial_sequence('"all_filters_filters_items"', 'id'), COALESCE((SELECT MAX(id) FROM "all_filters_filters_items"), 1));

ALTER TABLE "all_filters_filters_items" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_write" ON "all_filters_filters_items";
CREATE POLICY "admin_write" ON "all_filters_filters_items"
  AS PERMISSIVE FOR ALL TO public
  USING (is_admin());

DROP POLICY IF EXISTS "pub_read" ON "all_filters_filters_items";
CREATE POLICY "pub_read" ON "all_filters_filters_items"
  AS PERMISSIVE FOR SELECT TO public
  USING (true);

CREATE OR REPLACE VIEW "filters" AS
 SELECT id,
    translation_id,
    lang,
    uri,
    title,
    priority
   FROM all_filters;

CREATE OR REPLACE VIEW "filters_cat" AS
 SELECT id,
    translation_id,
    lang,
    pid,
    uri,
    title,
    priority
   FROM all_filters_filters;

CREATE OR REPLACE VIEW "filters_cat_items" AS
 SELECT id,
    fid,
    pid
   FROM all_filters_filters_items;

CREATE OR REPLACE VIEW "filters_items" AS
 SELECT id,
    fid,
    cid
   FROM all_filters_items;

GRANT ALL ON "filters", "filters_cat", "filters_cat_items", "filters_items" TO anon, authenticated, service_role;
