-- Whatever Nova Poshta's Counterparty/save actually returned when an
-- organization's TTN was created from its ЄДРПОУ (company name/legal form/
-- whatever fields NP's response happens to carry) — stored raw so the CRM
-- can show a manager exactly what got pulled, without having to guess the
-- response shape ahead of time. See npCreateTtn's organizationDetails in
-- lib/nova-poshta.ts and finishTtnCreation in lib/order-ttn.ts, which
-- writes this the moment an org TTN is created. Null for every
-- individual-recipient order, and for an organization order until its TTN
-- is actually created.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS np_org_details JSONB;
