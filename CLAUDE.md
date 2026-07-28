@AGENTS.md

# Supabase egress hygiene

The CRM talks to Supabase over PostgREST/supabase-js, which is a small
fraction of this project's total Supabase egress — the dominant cost is the
PHP storefronts' raw Postgres pooler connections (see their own CLAUDE.md
files). Still, this app had real waste from `force-dynamic` pages
re-running full-table queries on every navigation click. Rules going
forward:

1. **Prefer `unstable_cache` (from `next/cache`) over `force-dynamic`** for
   admin pages whose data doesn't need to be second-by-second fresh
   (dashboard, categories, articles, top-sales, sidebar nav — see
   `app/(admin)/*/page.tsx` and `app/(admin)/layout.tsx`). Pick a
   `revalidate` window (120-300s has been used here) that matches how
   often an admin actually needs to see their own edits reflected.
2. **Only keep `force-dynamic` where there's a real reason**, and comment
   why. `app/(admin)/users/page.tsx` needs it because `UsersTable`'s
   `useSearchParams()` requires a Suspense boundary during static
   generation otherwise — removing `force-dynamic` there breaks the build
   with `useSearchParams() should be wrapped in a suspense boundary`.
   `unstable_cache` still works independently of this and is what actually
   fixes the repeated-fetch problem. **Run `npm run build`, not just
   `tsc --noEmit`, before considering a route-segment-config change safe**
   — this exact class of error passed typecheck cleanly and only surfaced
   at build time.
3. **Never ship raw sensitive columns to the client just because they're
   convenient to select.** `users/page.tsx` used to send the raw
   `password` column (a hash, or a `"SUPABASE_AUTH"` migration marker) to
   the browser as page props just to compute a classic/premium split
   client-side. Compute the derived boolean server-side and strip the raw
   value before it leaves the server.
4. **Prefer a Postgres VIEW over a full-table fetch + client-side
   aggregation**, following the existing convention in `scripts/*.sql`
   (`category_product_counts`, `user_order_counts`, `warehouse_stats`,
   `top_selling_products`). `top-sales` used to pull the entire
   `orders_item` table (every line item ever placed) on every page view
   just to sum quantities per product client-side — the view does the
   `GROUP BY` in Postgres and returns only the top 30 rows.
5. **Views are fine to create; don't change existing table structure**
   without explicit sign-off — the storefronts (PHP) and this CRM share
   the same database, and a structural change here can silently break
   them.

Rollback point for the 2026-07 egress round: `git show
pre-egress-fix-2026-07-28`.
