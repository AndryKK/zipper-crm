-- Adds a hand-rolled pg_net webhook trigger on `orders_returns` INSERT (see
-- docs/setup-inventory-sync.sql for why this is pg_net directly rather than
-- Supabase's dashboard Database Webhooks UI — this project's Studio doesn't
-- have that helper). A new return submitted through the storefront's own
-- return form is a direct DB insert, never touching this app's API, so
-- nothing previously told app/api/webhooks/inventory-sync's "orders_returns"
-- branch (added alongside this trigger) to call
-- revalidateTag("sidebar-counts", ...) — the sidebar's red badge stayed
-- frozen at whatever it was on the last full page load until the 120s
-- unstable_cache window happened to expire. Mirrors
-- scripts/_add_orders_insert_webhook.sql exactly, just for a different table
-- and INSERT only (return status changes all go through this app's own
-- PATCH /api/returns/[returnId], which already calls revalidateTag itself).
--
-- Before running: replace <YOUR_WEBHOOK_SECRET> with the value of
-- INVENTORY_WEBHOOK_SECRET in .env.
create or replace function public.notify_inventory_sync_returns()
returns trigger
language plpgsql
security definer
as $$
begin
  perform net.http_post(
    url     := 'https://zipper-crm.vercel.app/api/webhooks/inventory-sync',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', '<YOUR_WEBHOOK_SECRET>'),
    body    := jsonb_build_object(
      'type', 'INSERT',
      'table', 'orders_returns',
      'record', to_jsonb(NEW),
      'old_record', null
    )
  );
  return NEW;
end;
$$;

drop trigger if exists trg_inventory_sync_returns on public.orders_returns;
create trigger trg_inventory_sync_returns
after insert on public.orders_returns
for each row execute function public.notify_inventory_sync_returns();
