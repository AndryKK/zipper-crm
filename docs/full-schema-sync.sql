-- Auto-generated: brings vtokkldabfrlcewzjliw schema to parity with
-- C:\Users\Pk\Desktop\correct-data-in-supabase (column-by-column diff).
-- Safe/additive only — no column is ever dropped or narrowed, so no data
-- loss. Run once in Supabase Dashboard → SQL Editor.

-- ── Missing columns on existing tables ─────────────────────────────

ALTER TABLE public.adm_users
  ADD COLUMN IF NOT EXISTS "auth_uid" TEXT;

ALTER TABLE public.all_filters_filters
  ADD COLUMN IF NOT EXISTS "img_icon" TEXT,
  ADD COLUMN IF NOT EXISTS "img" TEXT,
  ADD COLUMN IF NOT EXISTS "heading_contact" TEXT,
  ADD COLUMN IF NOT EXISTS "contact_person" INTEGER,
  ADD COLUMN IF NOT EXISTS "icon" TEXT,
  ADD COLUMN IF NOT EXISTS "icon_move" TEXT,
  ADD COLUMN IF NOT EXISTS "email" TEXT,
  ADD COLUMN IF NOT EXISTS "heading_news" TEXT,
  ADD COLUMN IF NOT EXISTS "descr" TEXT,
  ADD COLUMN IF NOT EXISTS "heading_docs" TEXT,
  ADD COLUMN IF NOT EXISTS "text" TEXT,
  ADD COLUMN IF NOT EXISTS "map" TEXT,
  ADD COLUMN IF NOT EXISTS "seo_title" TEXT,
  ADD COLUMN IF NOT EXISTS "seo_descr" TEXT,
  ADD COLUMN IF NOT EXISTS "seo_key" TEXT;

ALTER TABLE public.all_filters
  ADD COLUMN IF NOT EXISTS "img_icon" TEXT,
  ADD COLUMN IF NOT EXISTS "heading_contact" TEXT,
  ADD COLUMN IF NOT EXISTS "contact_person" INTEGER,
  ADD COLUMN IF NOT EXISTS "icon" TEXT,
  ADD COLUMN IF NOT EXISTS "icon_move" TEXT,
  ADD COLUMN IF NOT EXISTS "email" TEXT,
  ADD COLUMN IF NOT EXISTS "heading_news" TEXT,
  ADD COLUMN IF NOT EXISTS "heading_docs" TEXT,
  ADD COLUMN IF NOT EXISTS "text" TEXT,
  ADD COLUMN IF NOT EXISTS "map" TEXT,
  ADD COLUMN IF NOT EXISTS "seo_title" TEXT,
  ADD COLUMN IF NOT EXISTS "seo_descr" TEXT,
  ADD COLUMN IF NOT EXISTS "seo_key" TEXT;

ALTER TABLE public.articles_photos
  ADD COLUMN IF NOT EXISTS "translation_id" INTEGER,
  ADD COLUMN IF NOT EXISTS "lang" TEXT,
  ADD COLUMN IF NOT EXISTS "title" TEXT;

ALTER TABLE public.articles
  ADD COLUMN IF NOT EXISTS "pid" INTEGER,
  ADD COLUMN IF NOT EXISTS "img2" TEXT,
  ADD COLUMN IF NOT EXISTS "heading" TEXT,
  ADD COLUMN IF NOT EXISTS "seo_text" TEXT;

ALTER TABLE public.cart
  ADD COLUMN IF NOT EXISTS "note" TEXT;

ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS "img_icon" TEXT,
  ADD COLUMN IF NOT EXISTS "heading_contact" TEXT,
  ADD COLUMN IF NOT EXISTS "contact_person" INTEGER,
  ADD COLUMN IF NOT EXISTS "icon" TEXT,
  ADD COLUMN IF NOT EXISTS "icon_move" TEXT,
  ADD COLUMN IF NOT EXISTS "email" TEXT,
  ADD COLUMN IF NOT EXISTS "heading_news" TEXT,
  ADD COLUMN IF NOT EXISTS "heading_docs" TEXT,
  ADD COLUMN IF NOT EXISTS "map" TEXT,
  ADD COLUMN IF NOT EXISTS "seo_text" TEXT,
  ADD COLUMN IF NOT EXISTS "title_short" TEXT;

ALTER TABLE public.core
  ADD COLUMN IF NOT EXISTS "level_two" INTEGER,
  ADD COLUMN IF NOT EXISTS "translation_id" INTEGER,
  ADD COLUMN IF NOT EXISTS "root" INTEGER,
  ADD COLUMN IF NOT EXISTS "import_table" TEXT,
  ADD COLUMN IF NOT EXISTS "class" TEXT,
  ADD COLUMN IF NOT EXISTS "cover" TEXT,
  ADD COLUMN IF NOT EXISTS "title" TEXT,
  ADD COLUMN IF NOT EXISTS "visibility" INTEGER,
  ADD COLUMN IF NOT EXISTS "visibility2" INTEGER,
  ADD COLUMN IF NOT EXISTS "priority" INTEGER,
  ADD COLUMN IF NOT EXISTS "seo_text" TEXT,
  ADD COLUMN IF NOT EXISTS "seo_title_var" TEXT,
  ADD COLUMN IF NOT EXISTS "seo_descr_var" TEXT,
  ADD COLUMN IF NOT EXISTS "seo_key_var" TEXT,
  ADD COLUMN IF NOT EXISTS "seo_heading_var" TEXT,
  ADD COLUMN IF NOT EXISTS "text3" TEXT;

ALTER TABLE public.currency
  ADD COLUMN IF NOT EXISTS "translation_id" INTEGER,
  ADD COLUMN IF NOT EXISTS "lang" TEXT,
  ADD COLUMN IF NOT EXISTS "descr" TEXT,
  ADD COLUMN IF NOT EXISTS "text" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "priority" INTEGER,
  ADD COLUMN IF NOT EXISTS "seo_title" TEXT,
  ADD COLUMN IF NOT EXISTS "seo_descr" TEXT,
  ADD COLUMN IF NOT EXISTS "seo_key" TEXT;

ALTER TABLE public.custom_strings
  ADD COLUMN IF NOT EXISTS "translation_id" INTEGER,
  ADD COLUMN IF NOT EXISTS "title" TEXT;

ALTER TABLE public.docs
  ADD COLUMN IF NOT EXISTS "translation_id" INTEGER,
  ADD COLUMN IF NOT EXISTS "uri" TEXT,
  ADD COLUMN IF NOT EXISTS "date" TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "pid" INTEGER,
  ADD COLUMN IF NOT EXISTS "filter_id" INTEGER,
  ADD COLUMN IF NOT EXISTS "img" TEXT,
  ADD COLUMN IF NOT EXISTS "descr" TEXT,
  ADD COLUMN IF NOT EXISTS "text" TEXT;

ALTER TABLE public.gallery
  ADD COLUMN IF NOT EXISTS "priority" INTEGER;

ALTER TABLE public.langs
  ADD COLUMN IF NOT EXISTS "title_short" TEXT,
  ADD COLUMN IF NOT EXISTS "start" INTEGER;

ALTER TABLE public.managers
  ADD COLUMN IF NOT EXISTS "pid" INTEGER;

ALTER TABLE public.measures_real
  ADD COLUMN IF NOT EXISTS "img" TEXT,
  ADD COLUMN IF NOT EXISTS "lat" TEXT,
  ADD COLUMN IF NOT EXISTS "lng" TEXT;

ALTER TABLE public.measures
  ADD COLUMN IF NOT EXISTS "img" TEXT,
  ADD COLUMN IF NOT EXISTS "lat" TEXT,
  ADD COLUMN IF NOT EXISTS "lng" TEXT,
  ADD COLUMN IF NOT EXISTS "can_be_added_to_cart" INTEGER,
  ADD COLUMN IF NOT EXISTS "pid" INTEGER;

ALTER TABLE public.news_photos
  ADD COLUMN IF NOT EXISTS "translation_id" INTEGER,
  ADD COLUMN IF NOT EXISTS "lang" TEXT,
  ADD COLUMN IF NOT EXISTS "title" TEXT;

ALTER TABLE public.news
  ADD COLUMN IF NOT EXISTS "pid" INTEGER,
  ADD COLUMN IF NOT EXISTS "seo_title" TEXT,
  ADD COLUMN IF NOT EXISTS "seo_descr" TEXT,
  ADD COLUMN IF NOT EXISTS "seo_key" TEXT,
  ADD COLUMN IF NOT EXISTS "heading" TEXT,
  ADD COLUMN IF NOT EXISTS "seo_text" TEXT;

ALTER TABLE public.orders_returns
  ADD COLUMN IF NOT EXISTS "addr_delivery" TEXT,
  ADD COLUMN IF NOT EXISTS "order" INTEGER,
  ADD COLUMN IF NOT EXISTS "date_order" TEXT,
  ADD COLUMN IF NOT EXISTS "code" TEXT,
  ADD COLUMN IF NOT EXISTS "photo" TEXT,
  ADD COLUMN IF NOT EXISTS "submit" TEXT,
  ADD COLUMN IF NOT EXISTS "oid" INTEGER REFERENCES orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "product" INTEGER,
  ADD COLUMN IF NOT EXISTS "warehouse_id" INTEGER REFERENCES warehouses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "qty" INTEGER,
  ADD COLUMN IF NOT EXISTS "restocked" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS "password" TEXT,
  ADD COLUMN IF NOT EXISTS "type" TEXT,
  ADD COLUMN IF NOT EXISTS "full_name" TEXT,
  ADD COLUMN IF NOT EXISTS "short_name" TEXT,
  ADD COLUMN IF NOT EXISTS "addr_law" TEXT,
  ADD COLUMN IF NOT EXISTS "addr_physical" TEXT,
  ADD COLUMN IF NOT EXISTS "code" TEXT,
  ADD COLUMN IF NOT EXISTS "counts" TEXT,
  ADD COLUMN IF NOT EXISTS "phoned" INTEGER,
  ADD COLUMN IF NOT EXISTS "doc_field_3" TEXT,
  ADD COLUMN IF NOT EXISTS "nationality" TEXT,
  ADD COLUMN IF NOT EXISTS "issuing" TEXT,
  ADD COLUMN IF NOT EXISTS "birth" TEXT,
  ADD COLUMN IF NOT EXISTS "doc_field_2" TEXT,
  ADD COLUMN IF NOT EXISTS "emergency_name" TEXT,
  ADD COLUMN IF NOT EXISTS "emergency_number" TEXT,
  ADD COLUMN IF NOT EXISTS "submit" TEXT,
  ADD COLUMN IF NOT EXISTS "change_info" TEXT,
  ADD COLUMN IF NOT EXISTS "currency_rate" DOUBLE PRECISION;

ALTER TABLE public.products_favourites
  ADD COLUMN IF NOT EXISTS "cid" INTEGER;

ALTER TABLE public.products_photos2
  ADD COLUMN IF NOT EXISTS "translation_id" INTEGER,
  ADD COLUMN IF NOT EXISTS "lang" TEXT,
  ADD COLUMN IF NOT EXISTS "title" TEXT;

ALTER TABLE public.products_photos
  ADD COLUMN IF NOT EXISTS "translation_id" INTEGER,
  ADD COLUMN IF NOT EXISTS "lang" TEXT,
  ADD COLUMN IF NOT EXISTS "title" TEXT;

ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS "uri" TEXT;

ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS "translation_id" INTEGER,
  ADD COLUMN IF NOT EXISTS "title" TEXT;

ALTER TABLE public.settings_text
  ADD COLUMN IF NOT EXISTS "translation_id" INTEGER,
  ADD COLUMN IF NOT EXISTS "title" TEXT;

ALTER TABLE public.slider
  ADD COLUMN IF NOT EXISTS "title2" TEXT;

ALTER TABLE public.socials
  ADD COLUMN IF NOT EXISTS "translation_id" INTEGER,
  ADD COLUMN IF NOT EXISTS "lang" TEXT,
  ADD COLUMN IF NOT EXISTS "share_link" TEXT,
  ADD COLUMN IF NOT EXISTS "uri" TEXT;

ALTER TABLE public.users_categories
  ADD COLUMN IF NOT EXISTS "uri" TEXT,
  ADD COLUMN IF NOT EXISTS "img_icon" TEXT,
  ADD COLUMN IF NOT EXISTS "img" TEXT,
  ADD COLUMN IF NOT EXISTS "heading_contact" TEXT,
  ADD COLUMN IF NOT EXISTS "contact_person" INTEGER,
  ADD COLUMN IF NOT EXISTS "icon" TEXT,
  ADD COLUMN IF NOT EXISTS "icon_move" TEXT,
  ADD COLUMN IF NOT EXISTS "email" TEXT,
  ADD COLUMN IF NOT EXISTS "heading_news" TEXT,
  ADD COLUMN IF NOT EXISTS "descr" TEXT,
  ADD COLUMN IF NOT EXISTS "heading_docs" TEXT,
  ADD COLUMN IF NOT EXISTS "text" TEXT,
  ADD COLUMN IF NOT EXISTS "map" TEXT,
  ADD COLUMN IF NOT EXISTS "seo_title" TEXT,
  ADD COLUMN IF NOT EXISTS "seo_descr" TEXT,
  ADD COLUMN IF NOT EXISTS "seo_key" TEXT;

ALTER TABLE public.users_recover_password
  ADD COLUMN IF NOT EXISTS "hash" TEXT;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS "oldpassword" TEXT,
  ADD COLUMN IF NOT EXISTS "type" TEXT,
  ADD COLUMN IF NOT EXISTS "full_name" TEXT,
  ADD COLUMN IF NOT EXISTS "short_name" TEXT,
  ADD COLUMN IF NOT EXISTS "addr_law" TEXT,
  ADD COLUMN IF NOT EXISTS "addr_physical" TEXT,
  ADD COLUMN IF NOT EXISTS "code" TEXT,
  ADD COLUMN IF NOT EXISTS "doc_field_1" TEXT,
  ADD COLUMN IF NOT EXISTS "doc_field_3" TEXT,
  ADD COLUMN IF NOT EXISTS "nationality" TEXT,
  ADD COLUMN IF NOT EXISTS "issuing" TEXT,
  ADD COLUMN IF NOT EXISTS "birth" TEXT,
  ADD COLUMN IF NOT EXISTS "doc_field_2" TEXT,
  ADD COLUMN IF NOT EXISTS "emergency_name" TEXT,
  ADD COLUMN IF NOT EXISTS "emergency_number" TEXT,
  ADD COLUMN IF NOT EXISTS "notes" TEXT,
  ADD COLUMN IF NOT EXISTS "submit" TEXT,
  ADD COLUMN IF NOT EXISTS "change_info" TEXT,
  ADD COLUMN IF NOT EXISTS "submit_new" TEXT,
  ADD COLUMN IF NOT EXISTS "submit_new2" TEXT,
  ADD COLUMN IF NOT EXISTS "submit_new_user" TEXT,
  ADD COLUMN IF NOT EXISTS "auth_uid" TEXT;

-- ── Missing tables ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.categories_items (
  "id" SERIAL PRIMARY KEY,
  "translation_id" INTEGER,
  "lang" TEXT,
  "course" INTEGER,
  "data" TEXT,
  "title" TEXT,
  "person" TEXT,
  "priority" INTEGER
);

CREATE TABLE IF NOT EXISTS public.pc (
  "id" SERIAL PRIMARY KEY,
  "pid" INTEGER,
  "translation_id" INTEGER,
  "lang" TEXT,
  "img" TEXT,
  "title" TEXT,
  "priority" INTEGER
);

CREATE TABLE IF NOT EXISTS public.php_sessions (
  "id" SERIAL PRIMARY KEY,
  "data" TEXT,
  "last_activity" INTEGER
);

CREATE TABLE IF NOT EXISTS public.products_freq_together (
  "id" SERIAL PRIMARY KEY,
  "pid" INTEGER,
  "pid_with" INTEGER
);

-- ── Views (from views.txt) ───────────────────────────────────────────

create or replace view public.cproducts as
select
  (
    select count(*) as count
    from products_colors pc
    where pc.pid = p.translation_id
  ) as main_count,
  id, translation_id, pid, filter_id, lang, uri, pcode, img, img2, title,
  main_title, heading, package, price, price2, label_action, square,
  add_place, sq1, sq2, sq3, price_sale, sale, text, priority, popular,
  measure, minquantity, descr, map, seo_title, seo_descr, seo_key, seo_text,
  active, xml_id, xml_cat, sync_1c
from products p;

create or replace view public.filters as
select id, translation_id, lang, uri, title, priority
from all_filters;
