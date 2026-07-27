-- Adds orders.is_oversized — set from the stock-confirmation popup
-- ("Товари габаритні?") when an order is first processed, so that
-- whichever step later actually creates the Nova Poshta TTN (confirm
-- payment, postomat, cash-on-delivery, or the manual picker) knows which
-- sender warehouse to use: the small default branch (np_sender_warehouse_ref,
-- Відділення №100) for normal parcels, or the oversized-capable one
-- (np_sender_warehouse_ref_oversized, Відділення №18) for bulky items —
-- see lib/order-ttn.ts.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_oversized BOOLEAN NOT NULL DEFAULT false;
