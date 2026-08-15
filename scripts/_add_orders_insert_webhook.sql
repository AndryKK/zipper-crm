-- Extends the existing hand-rolled pg_net webhook trigger on `orders`
-- (see docs/setup-inventory-sync.sql) from UPDATE-only to INSERT+UPDATE, so
-- app/api/webhooks/inventory-sync's new "orders"+"INSERT" branch (sends the
-- one-time welcome email) actually fires. TG_OP/old_record are now dynamic
-- like notify_inventory_sync_items() already does, since OLD doesn't exist
-- on INSERT.
create or replace function public.notify_inventory_sync_orders()
returns trigger
language plpgsql
security definer
as $$
begin
  perform net.http_post(
    url     := 'https://zipper-crm.vercel.app/api/webhooks/inventory-sync',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', '__INVENTORY_WEBHOOK_SECRET__'),
    body    := jsonb_build_object(
      'type', TG_OP,
      'table', 'orders',
      'record', to_jsonb(NEW),
      'old_record', case when TG_OP = 'INSERT' then null else to_jsonb(OLD) end
    )
  );
  return NEW;
end;
$$;

drop trigger if exists trg_inventory_sync_orders on public.orders;
create trigger trg_inventory_sync_orders
after insert or update on public.orders
for each row execute function public.notify_inventory_sync_orders();
