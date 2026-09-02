-- Lets an order's recipient be a legal entity (organization) instead of a
-- private person for Nova Poshta TTN creation — see lib/nova-poshta.ts's
-- npCreateTtn() branching on CounterpartyType and lib/order-ttn.ts's
-- finishTtnCreation(), which reads these two columns straight off the
-- already-fetched `order` row as the default for every automatic TTN path
-- (confirm-payment, cod, generate), while the manual-TTN dialog lets a
-- manager see/override them per shipment.
--
-- The storefront checkout (a separate project, same DB) is expected to
-- populate these at order-creation time whenever a customer identifies as
-- a business and provides a ЄДРПОУ code; if it never writes them, both
-- columns stay at their default (is_organization false, edrpou null) and
-- every existing order/flow behaves exactly as before this migration.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_organization BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS edrpou TEXT;
