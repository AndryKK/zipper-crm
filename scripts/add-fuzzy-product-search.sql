-- Typo-tolerant, punctuation-insensitive, word-order-independent product
-- search for app/(admin)/products/page.tsx — see the RPC function below for
-- how it's used. Replaces a plain `title.ilike/pcode.ilike` substring match
-- (which failed on typos, reordered words, and never looked at filter
-- values at all — see the "виправи пошук" report).
--
-- Tuned twice against real reports, in order:
--   1. Too strict initially (missed genuine typos/word-order/filter
--      matches) — loosened to word_similarity at 0.35, then 0.45.
--   2. Too loose after that — a search for "тракторна блискавка тип 8"
--      returned "Тип 5" products (because the lone digit "8" matched
--      almost the whole catalog via degenerate short-string trigram
--      similarity) and, once that was fixed via substring digit matching,
--      STILL returned "Тип 7" products (because "8" is a literal substring
--      of "80см" in that title). Final explicit rule from the user: ignore
--      ONLY punctuation and word order; every word must genuinely be
--      contained (~90% similarity, not "vaguely related"); digits must
--      match exactly, not as a substring of a different number.
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
-- product group where EVERY word of the (normalized) search query is
-- genuinely contained somewhere: the product's title, its pcode
-- (артикул), or the title of any filter value assigned to it
-- (all_filters_filters_items/all_filters_filters — see
-- app/api/products/[id]/filters/route.ts's doc comment for that keying).
--
-- Requiring every word to match SOMEWHERE (not the whole phrase as one
-- substring, and not positionally) is what gives word-order independence —
-- "тип 3 нікель" and "нікель тип 3" match identically. Punctuation is
-- stripped before splitting into words for the same reason.
--
-- Three matching modes per word, chosen by what kind of token it is:
--
-- 1. PURE NUMBER (e.g. "8", "363") — must equal, EXACTLY, one of the
--    number-tokens extracted from the title (regexp_matches ... '\d+').
--    Substring containment is explicitly wrong here: "8" is a literal
--    substring of "80см", "18", "8203" — confirmed against the live DB
--    this let "Тракторна блискавка Тип 7 80см." match a "тип 8" search.
--    A type/size number has to match exactly, per the user's explicit
--    "цифри має бути збіг 100%".
--
-- 2. 1-2 CHARACTER WORD (e.g. "на", "ку") — plain substring match. A
--    trigram needs ~3 characters to mean anything, so word_similarity is
--    numerically degenerate for such short probes (confirmed: "8" alone —
--    before being reclassified as a pure-number token — matched the
--    entire catalog regardless of threshold).
--
-- 3. EVERYTHING ELSE — word_similarity()/`<%`, NOT similarity()/`%`
--    (which compares whole strings and dilutes a short word's score
--    against a long title regardless of match quality — confirmed:
--    similarity('Бігунок тест Тип 3 ...', 'бігунок') = 0.2, always below
--    any sane threshold even for an exact word match; word_similarity()
--    instead finds the best-matching span). Threshold is 0.9 — per the
--    user's explicit "може бути збіг 90% кожного слова, але має
--    містити" (~90% match per word, but must genuinely be contained) —
--    tight enough to reject "тест" vs "тесьма"-style unrelated overlap,
--    loose enough to still tolerate a single-character typo/OCR slip in a
--    longer word and Ukrainian case-ending variation on most words (e.g.
--    "тракторна" vs the title's own "тракторної" scores 0.8 and will NOT
--    match at 0.9 — a known, accepted tightening, not a bug).
--
-- PCODE matching mirrors the same split: substring for non-numeric words
-- (an artikul is normally copy-pasted or partially typed — "1028" finding
-- "bs10280" needs substring), but numeric words require exact equality
-- against the pcode's own extracted digit run, same as title. Plain
-- substring for numeric words here was a second, separate leak of the same
-- bug: "T8246"/"T9618" (real pcodes of unrelated "Тип 5" products) contain
-- "8" as a substring even after the title itself was fixed — confirmed
-- against the live DB these two products kept matching a "тип 8" search
-- purely through their pcode until this was applied here too.
--
-- statement_timeout is raised locally (via SET LOCAL, scoped to just this
-- call) — a long pasted-in title (10+ words) costs roughly linearly more
-- per extra word and can exceed whatever short default applies to this
-- role otherwise, surfacing as a hard 500 the page had no way to
-- distinguish from a genuine "nothing found".
--
-- `words` is deduplicated (SELECT DISTINCT) — without it, a query with any
-- repeated word (e.g. a title containing "колір" twice) makes total_words
-- count the duplicate, but `count(distinct word)` in the HAVING clause
-- below never can, so the match becomes mathematically impossible —
-- confirmed: "бігунок тест бігунок" (repeated) returned 0 results while
-- "бігунок тест" alone returned real matches.
--
-- via_title tracks whether a word matched the actual title (as opposed to
-- only via pcode or a filter value) — ranks results so the 500-row cap
-- trims the weakest matches first instead of an arbitrary DB-order slice;
-- confirmed this mattered for broad queries like "тракторна блискавка тип
-- 8", where genuine "Тип 8" products were missing from an unordered
-- result set even though hundreds of other rows matched too.
--
-- Not marked STABLE: SET LOCAL is rejected by Postgres inside a
-- non-volatile function ("SET is not allowed in a non-volatile function").
-- word_hits.translation_id is qualified everywhere (not bare
-- `translation_id`) because RETURNS TABLE(translation_id integer) makes
-- that name ambiguous with this function's own OUT parameter otherwise.
create or replace function search_products(search_query text)
returns table(translation_id integer)
language plpgsql
as $$
declare
  words text[];
  total_words integer;
begin
  set local pg_trgm.word_similarity_threshold = 0.9;
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

  return query
  with word_hits as (
    select w.word, p.translation_id,
      (case
        when w.word ~ '^[0-9]+$' then exists (
          select 1 from regexp_matches(p.title, '\d+', 'g') as m(digits)
          where m.digits[1] = w.word
        )
        when length(w.word) <= 2 then lower(p.title) like '%' || w.word || '%'
        else w.word <% lower(p.title)
      end) as via_title
    from unnest(words) as w(word)
    join products p
      on (
        case
          when w.word ~ '^[0-9]+$' then exists (
            select 1 from regexp_matches(p.title, '\d+', 'g') as m(digits)
            where m.digits[1] = w.word
          )
          when length(w.word) <= 2 then lower(p.title) like '%' || w.word || '%'
          else w.word <% lower(p.title)
        end
      )
      or (
        case
          when w.word ~ '^[0-9]+$' then exists (
            select 1 from regexp_matches(coalesce(p.pcode, ''), '\d+', 'g') as m(digits)
            where m.digits[1] = w.word
          )
          else lower(coalesce(p.pcode, '')) like '%' || w.word || '%'
        end
      )
    union
    select w.word, affi.pid as translation_id, false as via_title
    from unnest(words) as w(word)
    join all_filters_filters aff on (
      case
        when w.word ~ '^[0-9]+$' then exists (
          select 1 from regexp_matches(aff.title, '\d+', 'g') as m(digits)
          where m.digits[1] = w.word
        )
        when length(w.word) <= 2 then lower(aff.title) like '%' || w.word || '%'
        else w.word <% lower(aff.title)
      end
    )
    join all_filters_filters_items affi on affi.fid = aff.translation_id
  )
  select word_hits.translation_id
  from word_hits
  group by word_hits.translation_id
  having count(distinct word) = total_words
  order by count(*) filter (where via_title) desc, word_hits.translation_id desc
  limit 500;
end;
$$;
