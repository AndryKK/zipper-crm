-- NOTE: these old-project tables don't exist on the new project and were skipped: all_filters_filters_items, categories_items, pc, products_freq_together

-- Generated from the OLD Supabase project's RLS config.
-- Review before running against the new project.

-- Dependency: policies below call is_admin().
CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  SELECT COALESCE(
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin',
    false
  );
$function$;

ALTER TABLE "adm_login_fails" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "adm_users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "all_filters" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "all_filters_filters" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "all_filters_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "articles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "articles_photos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cart" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "categories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "core" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "currency" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "custom_strings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "docs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "gallery" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inventory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "langs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "managers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "measures" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "measures_real" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "news" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "news_photos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "orders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "orders_item" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "orders_returns" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "product_groups" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "products" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "products_categories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "products_chars" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "products_colors" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "products_favourites" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "products_photos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "products_photos2" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "products_together" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "services" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "settings_text" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "slider" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "socials" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "users_categories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "users_recover_password" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "warehouses" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_only" ON "adm_login_fails";
CREATE POLICY "admin_only" ON "adm_login_fails"
  AS PERMISSIVE FOR ALL TO public
  USING (is_admin());

DROP POLICY IF EXISTS "admin_only" ON "adm_users";
CREATE POLICY "admin_only" ON "adm_users"
  AS PERMISSIVE FOR ALL TO public
  USING (is_admin());

DROP POLICY IF EXISTS "admin_write" ON "all_filters";
CREATE POLICY "admin_write" ON "all_filters"
  AS PERMISSIVE FOR ALL TO public
  USING (is_admin());

DROP POLICY IF EXISTS "pub_read" ON "all_filters";
CREATE POLICY "pub_read" ON "all_filters"
  AS PERMISSIVE FOR SELECT TO public
  USING (true);

DROP POLICY IF EXISTS "admin_write" ON "all_filters_filters";
CREATE POLICY "admin_write" ON "all_filters_filters"
  AS PERMISSIVE FOR ALL TO public
  USING (is_admin());

DROP POLICY IF EXISTS "pub_read" ON "all_filters_filters";
CREATE POLICY "pub_read" ON "all_filters_filters"
  AS PERMISSIVE FOR SELECT TO public
  USING (true);

DROP POLICY IF EXISTS "admin_write" ON "all_filters_items";
CREATE POLICY "admin_write" ON "all_filters_items"
  AS PERMISSIVE FOR ALL TO public
  USING (is_admin());

DROP POLICY IF EXISTS "pub_read" ON "all_filters_items";
CREATE POLICY "pub_read" ON "all_filters_items"
  AS PERMISSIVE FOR SELECT TO public
  USING (true);

DROP POLICY IF EXISTS "admin_write" ON "articles";
CREATE POLICY "admin_write" ON "articles"
  AS PERMISSIVE FOR ALL TO public
  USING (is_admin());

DROP POLICY IF EXISTS "pub_read" ON "articles";
CREATE POLICY "pub_read" ON "articles"
  AS PERMISSIVE FOR SELECT TO public
  USING (true);

DROP POLICY IF EXISTS "admin_write" ON "articles_photos";
CREATE POLICY "admin_write" ON "articles_photos"
  AS PERMISSIVE FOR ALL TO public
  USING (is_admin());

DROP POLICY IF EXISTS "pub_read" ON "articles_photos";
CREATE POLICY "pub_read" ON "articles_photos"
  AS PERMISSIVE FOR SELECT TO public
  USING (true);

DROP POLICY IF EXISTS "cart_own_delete" ON "cart";
CREATE POLICY "cart_own_delete" ON "cart"
  AS PERMISSIVE FOR DELETE TO public
  USING ((((login)::text = auth.email()) OR is_admin()));

DROP POLICY IF EXISTS "cart_own_insert" ON "cart";
CREATE POLICY "cart_own_insert" ON "cart"
  AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((((login)::text = auth.email()) OR is_admin()));

DROP POLICY IF EXISTS "cart_own_select" ON "cart";
CREATE POLICY "cart_own_select" ON "cart"
  AS PERMISSIVE FOR SELECT TO public
  USING ((((login)::text = auth.email()) OR is_admin()));

DROP POLICY IF EXISTS "cart_own_update" ON "cart";
CREATE POLICY "cart_own_update" ON "cart"
  AS PERMISSIVE FOR UPDATE TO public
  USING ((((login)::text = auth.email()) OR is_admin()));

DROP POLICY IF EXISTS "admin_write" ON "categories";
CREATE POLICY "admin_write" ON "categories"
  AS PERMISSIVE FOR ALL TO public
  USING (is_admin());

DROP POLICY IF EXISTS "pub_read" ON "categories";
CREATE POLICY "pub_read" ON "categories"
  AS PERMISSIVE FOR SELECT TO public
  USING (true);

DROP POLICY IF EXISTS "admin_write" ON "core";
CREATE POLICY "admin_write" ON "core"
  AS PERMISSIVE FOR ALL TO public
  USING (is_admin());

DROP POLICY IF EXISTS "pub_read" ON "core";
CREATE POLICY "pub_read" ON "core"
  AS PERMISSIVE FOR SELECT TO public
  USING (true);

DROP POLICY IF EXISTS "admin_write" ON "currency";
CREATE POLICY "admin_write" ON "currency"
  AS PERMISSIVE FOR ALL TO public
  USING (is_admin());

DROP POLICY IF EXISTS "pub_read" ON "currency";
CREATE POLICY "pub_read" ON "currency"
  AS PERMISSIVE FOR SELECT TO public
  USING (true);

DROP POLICY IF EXISTS "admin_write" ON "custom_strings";
CREATE POLICY "admin_write" ON "custom_strings"
  AS PERMISSIVE FOR ALL TO public
  USING (is_admin());

DROP POLICY IF EXISTS "pub_read" ON "custom_strings";
CREATE POLICY "pub_read" ON "custom_strings"
  AS PERMISSIVE FOR SELECT TO public
  USING (true);

DROP POLICY IF EXISTS "admin_write" ON "docs";
CREATE POLICY "admin_write" ON "docs"
  AS PERMISSIVE FOR ALL TO public
  USING (is_admin());

DROP POLICY IF EXISTS "pub_read" ON "docs";
CREATE POLICY "pub_read" ON "docs"
  AS PERMISSIVE FOR SELECT TO public
  USING (true);

DROP POLICY IF EXISTS "admin_write" ON "gallery";
CREATE POLICY "admin_write" ON "gallery"
  AS PERMISSIVE FOR ALL TO public
  USING (is_admin());

DROP POLICY IF EXISTS "pub_read" ON "gallery";
CREATE POLICY "pub_read" ON "gallery"
  AS PERMISSIVE FOR SELECT TO public
  USING (true);

DROP POLICY IF EXISTS "admin_write" ON "langs";
CREATE POLICY "admin_write" ON "langs"
  AS PERMISSIVE FOR ALL TO public
  USING (is_admin());

DROP POLICY IF EXISTS "pub_read" ON "langs";
CREATE POLICY "pub_read" ON "langs"
  AS PERMISSIVE FOR SELECT TO public
  USING (true);

DROP POLICY IF EXISTS "admin_write" ON "managers";
CREATE POLICY "admin_write" ON "managers"
  AS PERMISSIVE FOR ALL TO public
  USING (is_admin());

DROP POLICY IF EXISTS "pub_read" ON "managers";
CREATE POLICY "pub_read" ON "managers"
  AS PERMISSIVE FOR SELECT TO public
  USING (true);

DROP POLICY IF EXISTS "admin_write" ON "measures";
CREATE POLICY "admin_write" ON "measures"
  AS PERMISSIVE FOR ALL TO public
  USING (is_admin());

DROP POLICY IF EXISTS "pub_read" ON "measures";
CREATE POLICY "pub_read" ON "measures"
  AS PERMISSIVE FOR SELECT TO public
  USING (true);

DROP POLICY IF EXISTS "admin_write" ON "measures_real";
CREATE POLICY "admin_write" ON "measures_real"
  AS PERMISSIVE FOR ALL TO public
  USING (is_admin());

DROP POLICY IF EXISTS "pub_read" ON "measures_real";
CREATE POLICY "pub_read" ON "measures_real"
  AS PERMISSIVE FOR SELECT TO public
  USING (true);

DROP POLICY IF EXISTS "admin_write" ON "news";
CREATE POLICY "admin_write" ON "news"
  AS PERMISSIVE FOR ALL TO public
  USING (is_admin());

DROP POLICY IF EXISTS "pub_read" ON "news";
CREATE POLICY "pub_read" ON "news"
  AS PERMISSIVE FOR SELECT TO public
  USING (true);

DROP POLICY IF EXISTS "admin_write" ON "news_photos";
CREATE POLICY "admin_write" ON "news_photos"
  AS PERMISSIVE FOR ALL TO public
  USING (is_admin());

DROP POLICY IF EXISTS "pub_read" ON "news_photos";
CREATE POLICY "pub_read" ON "news_photos"
  AS PERMISSIVE FOR SELECT TO public
  USING (true);

DROP POLICY IF EXISTS "orders_admin_delete" ON "orders";
CREATE POLICY "orders_admin_delete" ON "orders"
  AS PERMISSIVE FOR DELETE TO public
  USING (is_admin());

DROP POLICY IF EXISTS "orders_admin_update" ON "orders";
CREATE POLICY "orders_admin_update" ON "orders"
  AS PERMISSIVE FOR UPDATE TO public
  USING (is_admin());

DROP POLICY IF EXISTS "orders_own_insert" ON "orders";
CREATE POLICY "orders_own_insert" ON "orders"
  AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((((login)::text = auth.email()) OR is_admin()));

DROP POLICY IF EXISTS "orders_own_select" ON "orders";
CREATE POLICY "orders_own_select" ON "orders"
  AS PERMISSIVE FOR SELECT TO public
  USING ((((login)::text = auth.email()) OR is_admin()));

DROP POLICY IF EXISTS "order_items_admin_write" ON "orders_item";
CREATE POLICY "order_items_admin_write" ON "orders_item"
  AS PERMISSIVE FOR ALL TO public
  USING (is_admin());

DROP POLICY IF EXISTS "order_items_select" ON "orders_item";
CREATE POLICY "order_items_select" ON "orders_item"
  AS PERMISSIVE FOR SELECT TO public
  USING ((is_admin() OR (EXISTS ( SELECT 1
   FROM orders o
  WHERE ((o.id = orders_item.oid) AND ((o.login)::text = auth.email()))))));

DROP POLICY IF EXISTS "returns_admin_delete" ON "orders_returns";
CREATE POLICY "returns_admin_delete" ON "orders_returns"
  AS PERMISSIVE FOR DELETE TO public
  USING (is_admin());

DROP POLICY IF EXISTS "returns_admin_update" ON "orders_returns";
CREATE POLICY "returns_admin_update" ON "orders_returns"
  AS PERMISSIVE FOR UPDATE TO public
  USING (is_admin());

DROP POLICY IF EXISTS "returns_own_insert" ON "orders_returns";
CREATE POLICY "returns_own_insert" ON "orders_returns"
  AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((((login)::text = auth.email()) OR is_admin()));

DROP POLICY IF EXISTS "returns_own_select" ON "orders_returns";
CREATE POLICY "returns_own_select" ON "orders_returns"
  AS PERMISSIVE FOR SELECT TO public
  USING ((((login)::text = auth.email()) OR is_admin()));

DROP POLICY IF EXISTS "admin_write" ON "products";
CREATE POLICY "admin_write" ON "products"
  AS PERMISSIVE FOR ALL TO public
  USING (is_admin());

DROP POLICY IF EXISTS "pub_read" ON "products";
CREATE POLICY "pub_read" ON "products"
  AS PERMISSIVE FOR SELECT TO public
  USING (true);

DROP POLICY IF EXISTS "admin_write" ON "products_categories";
CREATE POLICY "admin_write" ON "products_categories"
  AS PERMISSIVE FOR ALL TO public
  USING (is_admin());

DROP POLICY IF EXISTS "pub_read" ON "products_categories";
CREATE POLICY "pub_read" ON "products_categories"
  AS PERMISSIVE FOR SELECT TO public
  USING (true);

DROP POLICY IF EXISTS "admin_write" ON "products_chars";
CREATE POLICY "admin_write" ON "products_chars"
  AS PERMISSIVE FOR ALL TO public
  USING (is_admin());

DROP POLICY IF EXISTS "pub_read" ON "products_chars";
CREATE POLICY "pub_read" ON "products_chars"
  AS PERMISSIVE FOR SELECT TO public
  USING (true);

DROP POLICY IF EXISTS "admin_write" ON "products_colors";
CREATE POLICY "admin_write" ON "products_colors"
  AS PERMISSIVE FOR ALL TO public
  USING (is_admin());

DROP POLICY IF EXISTS "pub_read" ON "products_colors";
CREATE POLICY "pub_read" ON "products_colors"
  AS PERMISSIVE FOR SELECT TO public
  USING (true);

DROP POLICY IF EXISTS "favourites_auth" ON "products_favourites";
CREATE POLICY "favourites_auth" ON "products_favourites"
  AS PERMISSIVE FOR ALL TO public
  USING (((auth.role() = 'authenticated'::text) OR is_admin()));

DROP POLICY IF EXISTS "admin_write" ON "products_photos";
CREATE POLICY "admin_write" ON "products_photos"
  AS PERMISSIVE FOR ALL TO public
  USING (is_admin());

DROP POLICY IF EXISTS "pub_read" ON "products_photos";
CREATE POLICY "pub_read" ON "products_photos"
  AS PERMISSIVE FOR SELECT TO public
  USING (true);

DROP POLICY IF EXISTS "admin_write" ON "products_photos2";
CREATE POLICY "admin_write" ON "products_photos2"
  AS PERMISSIVE FOR ALL TO public
  USING (is_admin());

DROP POLICY IF EXISTS "pub_read" ON "products_photos2";
CREATE POLICY "pub_read" ON "products_photos2"
  AS PERMISSIVE FOR SELECT TO public
  USING (true);

DROP POLICY IF EXISTS "admin_write" ON "products_together";
CREATE POLICY "admin_write" ON "products_together"
  AS PERMISSIVE FOR ALL TO public
  USING (is_admin());

DROP POLICY IF EXISTS "pub_read" ON "products_together";
CREATE POLICY "pub_read" ON "products_together"
  AS PERMISSIVE FOR SELECT TO public
  USING (true);

DROP POLICY IF EXISTS "admin_write" ON "services";
CREATE POLICY "admin_write" ON "services"
  AS PERMISSIVE FOR ALL TO public
  USING (is_admin());

DROP POLICY IF EXISTS "pub_read" ON "services";
CREATE POLICY "pub_read" ON "services"
  AS PERMISSIVE FOR SELECT TO public
  USING (true);

DROP POLICY IF EXISTS "admin_write" ON "settings";
CREATE POLICY "admin_write" ON "settings"
  AS PERMISSIVE FOR ALL TO public
  USING (is_admin());

DROP POLICY IF EXISTS "pub_read" ON "settings";
CREATE POLICY "pub_read" ON "settings"
  AS PERMISSIVE FOR SELECT TO public
  USING (true);

DROP POLICY IF EXISTS "admin_write" ON "settings_text";
CREATE POLICY "admin_write" ON "settings_text"
  AS PERMISSIVE FOR ALL TO public
  USING (is_admin());

DROP POLICY IF EXISTS "pub_read" ON "settings_text";
CREATE POLICY "pub_read" ON "settings_text"
  AS PERMISSIVE FOR SELECT TO public
  USING (true);

DROP POLICY IF EXISTS "admin_write" ON "slider";
CREATE POLICY "admin_write" ON "slider"
  AS PERMISSIVE FOR ALL TO public
  USING (is_admin());

DROP POLICY IF EXISTS "pub_read" ON "slider";
CREATE POLICY "pub_read" ON "slider"
  AS PERMISSIVE FOR SELECT TO public
  USING (true);

DROP POLICY IF EXISTS "admin_write" ON "socials";
CREATE POLICY "admin_write" ON "socials"
  AS PERMISSIVE FOR ALL TO public
  USING (is_admin());

DROP POLICY IF EXISTS "pub_read" ON "socials";
CREATE POLICY "pub_read" ON "socials"
  AS PERMISSIVE FOR SELECT TO public
  USING (true);

DROP POLICY IF EXISTS "admin_delete_user" ON "users";
CREATE POLICY "admin_delete_user" ON "users"
  AS PERMISSIVE FOR DELETE TO public
  USING (is_admin());

DROP POLICY IF EXISTS "admin_insert_user" ON "users";
CREATE POLICY "admin_insert_user" ON "users"
  AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS "user_read_own" ON "users";
CREATE POLICY "user_read_own" ON "users"
  AS PERMISSIVE FOR SELECT TO public
  USING ((((login)::text = auth.email()) OR is_admin()));

DROP POLICY IF EXISTS "user_update_own" ON "users";
CREATE POLICY "user_update_own" ON "users"
  AS PERMISSIVE FOR UPDATE TO public
  USING ((((login)::text = auth.email()) OR is_admin()));

DROP POLICY IF EXISTS "admin_write" ON "users_categories";
CREATE POLICY "admin_write" ON "users_categories"
  AS PERMISSIVE FOR ALL TO public
  USING (is_admin());

DROP POLICY IF EXISTS "pub_read" ON "users_categories";
CREATE POLICY "pub_read" ON "users_categories"
  AS PERMISSIVE FOR SELECT TO public
  USING (true);

DROP POLICY IF EXISTS "own_or_admin" ON "users_recover_password";
CREATE POLICY "own_or_admin" ON "users_recover_password"
  AS PERMISSIVE FOR ALL TO public
  USING ((((login)::text = auth.email()) OR is_admin()));

