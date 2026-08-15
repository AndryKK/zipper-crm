-- Adds orders.supplier_override — lets a manager force which supplier
-- (settings supplier_* vs supplier2_*) an order's invoice/waybill is
-- generated from, overriding the automatic amount-vs-threshold pick (see
-- getOrderDocumentData in lib/order-documents.ts). NULL = automatic
-- (default behavior, unchanged); 1 = force supplier 1; 2 = force supplier 2.
-- Set from the "Перевірка наявності на складі" popup when processing an
-- order, so it's a one-time-per-order manual choice, not a global setting.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS supplier_override SMALLINT;
