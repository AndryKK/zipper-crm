-- Correction: the initial backfill in add-welcome-email-sent-column.sql also
-- stamped welcome_email_sent_at on every historical order, but that column
-- is meant to record when a real email actually went out (the CRM order
-- list shows a green envelope icon whenever it's set) — backfilled rows
-- never got a real email, so their timestamp must be cleared. Safe to run
-- immediately after the migration, before any cron/real send has happened.
UPDATE orders SET welcome_email_sent_at = NULL WHERE welcome_email_sent = true;
