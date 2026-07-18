-- Run this once in the Supabase Dashboard → SQL Editor (this app has no
-- direct DB/DDL access from its runtime environment, so this step is manual).

-- ─────────────────────────────────────────────────────────────────────────
-- PART 1 — orders_returns columns
-- Extends orders_returns with proper links to an order/product/warehouse
-- so a return can actually restock inventory. Existing legacy rows are left
-- untouched (all new columns are nullable).
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE orders_returns
  ADD COLUMN IF NOT EXISTS oid INTEGER REFERENCES orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS product INTEGER,
  ADD COLUMN IF NOT EXISTS warehouse_id INTEGER REFERENCES warehouses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS qty INTEGER,
  ADD COLUMN IF NOT EXISTS restocked BOOLEAN NOT NULL DEFAULT false;

-- ─────────────────────────────────────────────────────────────────────────
-- PART 2 — webhook triggers (this project's Studio has no built-in
-- "Database Webhooks" helper function in the Triggers UI, so we create the
-- same thing by hand using pg_net — this is exactly what Supabase's own
-- Webhooks feature does under the hood).
--
-- ⚠️ BEFORE RUNNING: replace both occurrences of
--   <YOUR_WEBHOOK_URL>    with  https://zipper-new-shop.vercel.app/api/webhooks/inventory-sync
--   <YOUR_WEBHOOK_SECRET> with  the value of INVENTORY_WEBHOOK_SECRET in .env
-- ─────────────────────────────────────────────────────────────────────────

create extension if not exists pg_net;

create or replace function public.notify_inventory_sync_items()
returns trigger
language plpgsql
security definer
as $$
begin
  perform net.http_post(
    url     := 'https://zipper-new-shop.vercel.app/api/webhooks/inventory-sync',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', '<YOUR_WEBHOOK_SECRET>'),
    body    := jsonb_build_object(
      'type', TG_OP,
      'table', 'orders_item',
      'record', case when TG_OP = 'DELETE' then null else to_jsonb(NEW) end,
      'old_record', case when TG_OP = 'INSERT' then null else to_jsonb(OLD) end
    )
  );
  return coalesce(NEW, OLD);
end;
$$;

drop trigger if exists trg_inventory_sync_items on public.orders_item;
create trigger trg_inventory_sync_items
after insert or update or delete on public.orders_item
for each row execute function public.notify_inventory_sync_items();

create or replace function public.notify_inventory_sync_orders()
returns trigger
language plpgsql
security definer
as $$
begin
  perform net.http_post(
    url     := 'https://zipper-new-shop.vercel.app/api/webhooks/inventory-sync',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', '<YOUR_WEBHOOK_SECRET>'),
    body    := jsonb_build_object(
      'type', 'UPDATE',
      'table', 'orders',
      'record', to_jsonb(NEW),
      'old_record', to_jsonb(OLD)
    )
  );
  return NEW;
end;
$$;

drop trigger if exists trg_inventory_sync_orders on public.orders;
create trigger trg_inventory_sync_orders
after update on public.orders
for each row execute function public.notify_inventory_sync_orders();
