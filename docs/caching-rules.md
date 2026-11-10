# Caching rules — read before adding `unstable_cache`, `revalidateTag`, or `revalidatePath` anywhere in this app

This project runs on **Vercel Hobby**, which caps ISR/Data Cache writes at
**200,000/month**. On 2026-11, usage hit ~226,000/month and the site risked
losing ISR entirely. Root cause and fix: see the 2026-11-10 commit removing
`revalidateTag("sidebar-counts")` from `app/api/webhooks/inventory-sync/route.ts`
and seven other call sites. Read that commit message for the full incident
writeup before changing anything below.

## The one rule that matters

**Every call to `revalidateTag()` / `revalidatePath()` is itself a billed
cache write — whether or not anyone ever requests the page afterward.**
This is different from how time-based `revalidate: N` works (that only
writes when an actual request arrives after the window expires, capping
writes at roughly `86400/N` per day per cache key, no matter how much
traffic there is).

This means **on-demand invalidation must only ever be triggered by a
genuine, bounded, human-initiated action** (an admin clicking a specific
button). It must **never** be wired into:

- A **database webhook** that fires on every row write to a busy table
  (orders, orders_item, etc.) — write volume there is driven by raw
  business/storefront traffic, not by admin usage, and has no natural cap.
- A **cron or "simulate a cron via heartbeat" mechanism** that calls it
  unconditionally on every run, regardless of whether anything actually
  changed.
- Any code path that's hit by **automated/background processes** (sync
  scripts, status-polling jobs) rather than a specific person clicking a
  specific thing.

If you're tempted to add `revalidateTag`/`revalidatePath` to make some
cached value feel "instantly fresh," ask first: **is the existing
`revalidate: N` window (see below) actually too stale for this?** For a
sidebar badge count, a dashboard stat, or a rarely-changing list (categories,
articles), the answer is almost always no — a 2–5 minute lag is invisible
in practice, and the on-demand path is not worth its write cost.

## Current caches in this app (as of 2026-11-10)

All of these use a **static cache key** (no per-request/per-user/per-query
parameters) and **no tags** — purely time-based, bounded writes:

| Cache | File | Key | Window |
|---|---|---|---|
| Sidebar categories | `app/(admin)/layout.tsx` | `admin-sidebar-categories` | 300s |
| Sidebar badge counts | `app/(admin)/layout.tsx` | `admin-sidebar-counts` | 120s |
| Dashboard stats | `app/(admin)/page.tsx` | `dashboard-stats` | 120s |
| Categories page | `app/(admin)/categories/page.tsx` | `categories-page` | 180s |
| Articles page | `app/(admin)/articles/page.tsx` | `articles-page` | 180s |
| Top sales | `app/(admin)/top-sales/page.tsx` | `top-sales` | 300s |
| Users/clients page | `app/(admin)/users/page.tsx` | `users-page` | 180s |

**Never parameterize a cache key by anything that varies per request**
(a search query, a page number, a specific order/user ID, a date range a
user picks). Each distinct key is its own independent cache entry with its
own independent write schedule — a key that varies across hundreds of
possible values turns one bounded cache into hundreds of unbounded ones.
If a page genuinely needs per-parameter freshness, it almost certainly
should NOT be wrapped in `unstable_cache` at all — fetch it live instead
(this is exactly why `/orders`, `/orders/[id]`, `/products`, and
`/inventory` are plain `force-dynamic` with no caching layer: their data
changes per view and per query, so there's nothing safe to cache).

## Before adding a new cached page

1. Does this data change rarely enough that 2–5 minutes of staleness is
   genuinely invisible to an admin? If the data is personalized, per-query,
   or something an admin edits and expects to see reflected immediately
   on the same page, **do not cache it** — use `force-dynamic` (or no
   special config at all) instead.
2. Use a **static string key** — never include request-derived values in
   the key array.
3. Pick a `revalidate` window (120–300s has been the norm here) and do
   **not** add `tags` unless you have a specific, bounded, human-triggered
   invalidation point in mind — and even then, reconsider whether the
   plain time window is enough first.
4. If you do add on-demand invalidation, grep this repo for
   `revalidateTag` first and confirm your new call site is NOT reachable
   from a webhook, cron, or any loop/batch operation. One call site per
   genuine button click is fine; one call site inside a function that
   runs per-row of a batch is not.

## Monitoring

Check **Vercel → Project → Usage → ISR Writes** periodically (monthly, or
after any change to a webhook/cron that touches `orders`/`orders_item`/
`orders_returns`). A sudden jump after a deploy almost always means a new
`revalidateTag`/`revalidatePath` call landed somewhere it shouldn't have —
grep for it the same way this incident was found: `grep -rn
"revalidateTag\|revalidatePath" app lib`, then check whether each call
site is reachable from a webhook/cron/batch loop versus a single bounded
user action.
