-- Adds orders.welcome_email_sent / welcome_email_sent_at — tracks whether the
-- automatic "your order is being checked against warehouse stock" greeting
-- email (app/api/cron/send-welcome-emails) has already gone out for this
-- order, so it's only ever sent once.
--
-- Backfill: every order that already exists at the time this ships is
-- historical — only orders created from now on should receive the new
-- greeting email, so every existing row is marked as already-sent here.
-- New orders inserted afterwards default to welcome_email_sent=false and
-- are exactly what the cron picks up.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS welcome_email_sent BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS welcome_email_sent_at TIMESTAMPTZ;

UPDATE orders SET welcome_email_sent = true, welcome_email_sent_at = now() WHERE welcome_email_sent = false;
