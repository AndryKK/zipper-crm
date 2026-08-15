-- Read-only diagnostics: is the DB actually hung, or just slow from a
-- pg_net webhook-delivery backlog after the welcome_email_sent backfill
-- UPDATE fired the orders-table Database Webhook ~18k times at once?
SELECT pid, state, wait_event_type, wait_event, now() - query_start AS running_for, left(query, 200) AS query
FROM pg_stat_activity
WHERE state != 'idle' AND pid != pg_backend_pid()
ORDER BY query_start ASC;
