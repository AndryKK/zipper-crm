-- Typo-tolerant, punctuation-insensitive, word-order-independent product
-- search for app/(admin)/products/page.tsx — see the RPC function below for
-- how it's used. Replaces a plain `title.ilike/pcode.ilike` substring match
-- (which failed on typos, reordered words, and never looked at filter
-- values at all — see the "виправи пошук" report).
create extension if not exists pg_trgm;

-- GIN trigram indexes — required for the `<%` (word-similarity) operator
-- below to actually use an index instead of a full sequential scan
-- computing word_similarity() per row. Without these the function timed
-- out (statement timeout, confirmed against the live DB on ~10k products).
create index if not exists idx_products_title_trgm on products using gin (lower(title) gin_trgm_ops);
create index if not exists idx_products_pcode_trgm on products using gin (lower(pcode) gin_trgm_ops);
create index if not exists idx_all_filters_filters_title_trgm on all_filters_filters using gin (lower(title) gin_trgm_ops);
create index if not exists idx_all_filters_filters_items_fid on all_filters_filters_items (fid);

-- search_products(search_query) — returns the translation_id of every
-- product group where EVERY word of the (normalized) search query has at
-- least a loose match somewhere: the product's title, its pcode
-- (артикул), or the title of any filter value assigned to it
-- (all_filters_filters_items/all_filters_filters — see
-- app/api/products/[id]/filters/route.ts's doc comment for that keying).
--
-- Requiring every word to match SOMEWHERE (not the whole phrase as one
-- substring, and not positionally) is what gives word-order independence —
-- "тип 3 нікель" and "нікель тип 3" match identically.
--
-- TITLE/FILTER matching uses word_similarity()/`<%` (typo-tolerant, not
-- exact substring) — NOT similarity()/`%`, which compares entire strings:
-- a short search word against a long multi-word title gets diluted to a
-- low score regardless of how well it matches one word of it (confirmed
-- against the live DB: similarity('Бігунок тест Тип 3 ...', 'бігунок') =
-- 0.2, always below any sane threshold even for an exact word match).
-- word_similarity() instead finds the best-matching span within the
-- longer text.
--
-- PCODE matching is a plain substring check (ILIKE-equivalent), NOT
-- fuzzy — confirmed against the live DB that fuzzy matching here is
-- actively wrong: pcode "bs10280" scored word_similarity 0.625 against
-- unrelated neighboring codes like "bs10278"/"bs1021"/"bs1022" (they share
-- the "bs10" prefix and similar digit runs), the exact same score range as
-- a genuine one-letter typo of a real word — so no fuzzy threshold can
-- tell "typo of this code" apart from "a different, nearby code" for a
-- short structured identifier. An artikul is normally copy-pasted or read
-- off a label, not typed from memory, so exact/substring matching (still
-- forgiving of a truncated/partial code) is the right default here, unlike
-- free-text title words.
--
-- 0.45 for word_similarity_threshold was picked empirically against the
-- live DB: below it, short words like "тест" scored ~0.4 against titles
-- that don't contain anything like it at all (pure trigram noise); at
-- 0.45+ that noise is gone while real one-letter typos of real words still
-- land at 0.5-0.65. Some residual over-matching against genuinely similar
-- words (e.g. "тест" vs "тесьма") is expected and accepted — the ask was
-- for search to be "дуже м'яко" (very forgiving), and that tradeoff is
-- what forgiving costs. Not marked STABLE: SET LOCAL is rejected by
-- Postgres inside a non-volatile function ("SET is not allowed in a
-- non-volatile function" — also confirmed against the live DB).
--
-- statement_timeout is raised locally (still scoped to just this call, via
-- SET LOCAL) — a long pasted-in title (10+ words) costs roughly linearly
-- more per extra word (~150-200ms/word measured against the live DB) and
-- can exceed whatever short default applies to this role otherwise,
-- surfacing as a hard 500 the page had no way to distinguish from a
-- genuine "nothing found" (confirmed: pasting a product's own full title
-- back in as the search — a real report — timed out at 6+ words).
--
-- `words` is deduplicated (select DISTINCT, not just select) — a real,
-- confirmed bug: without it, a query with any repeated word (e.g. this
-- same title has "колір" twice) made total_words count the duplicate, but
-- `count(distinct word)` in the HAVING clause below never can, so the
-- match was mathematically impossible to satisfy — reproduced directly:
-- "бігунок тест бігунок" (repeated "бігунок") returned 0 results while
-- "бігунок тест" alone returned 456.
create or replace function search_products(search_query text)
returns table(translation_id integer)
language plpgsql
as $$
declare
  words text[];
  total_words integer;
begin
  set local pg_trgm.word_similarity_threshold = 0.45;
  set local statement_timeout = '10s';

  words := array(
    select distinct w from unnest(
      string_to_array(
        trim(both ' ' from regexp_replace(lower(search_query), '[,;/\_\-–—]+', ' ', 'g')),
        ' '
      )
    ) w
    where length(trim(w)) > 0
  );

  if words is null or array_length(words, 1) is null then
    return;
  end if;

  total_words := array_length(words, 1);

  -- word_hits.translation_id is qualified everywhere below (not bare
  -- `translation_id`) because RETURNS TABLE(translation_id integer) makes
  -- that name ambiguous with this function's own OUT parameter otherwise
  -- ("column reference is ambiguous" — confirmed against the live DB).
  return query
  with word_hits as (
    select w.word, p.translation_id
    from unnest(words) as w(word)
    join products p
      on w.word <% lower(p.title) or lower(coalesce(p.pcode, '')) like '%' || w.word || '%'
    union
    select w.word, affi.pid as translation_id
    from unnest(words) as w(word)
    join all_filters_filters aff on w.word <% lower(aff.title)
    join all_filters_filters_items affi on affi.fid = aff.translation_id
  )
  select word_hits.translation_id
  from word_hits
  group by word_hits.translation_id
  having count(distinct word) = total_words
  limit 500;
end;
$$;
