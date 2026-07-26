-- Per-customer order counts, aggregated in Postgres.
--
-- /users previously paginated through the ENTIRE orders table (20k+ rows
-- and growing) on every single visit, selecting only `login`, purely to
-- count how many orders each customer has placed — same "the whole table
-- gets re-transferred on every page load" shape as the categories N+1 and
-- warehouse_stats before their fixes. A live GROUP BY view (same reasoning:
-- cheap enough to aggregate on every request, no staleness, no cron)
-- shrinks this to one row per distinct customer login instead of one row
-- per order.
CREATE OR REPLACE VIEW user_order_counts AS
SELECT login, COUNT(*)::int AS order_count
FROM orders
WHERE login IS NOT NULL
GROUP BY login;

GRANT SELECT ON user_order_counts TO anon, authenticated, service_role;
