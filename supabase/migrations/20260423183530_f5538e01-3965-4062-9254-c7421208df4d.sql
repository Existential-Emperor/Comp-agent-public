-- One-time cleanup: remove news_items that slipped past the original news filter
-- (comparison articles, listicles, alternatives pages, buyer's guides, vs. articles).
-- The hardened filter in news-discover + post-scrape gate in news-hydrate prevents
-- new ones from entering, but pre-existing rows must be purged.

DELETE FROM public.saved_items
WHERE news_item_id IN (
  SELECT id FROM public.news_items
  WHERE item_type = 'news'
    AND (
      title ~* '\bvs\.?\b'
      OR title ~* '\bversus\b'
      OR title ~* '\bcompare(?:d|s)?\b'
      OR title ~* '\bcomparison\b'
      OR title ~* '\balternatives?\b'
      OR title ~* '\bcompetitors?\b'
      OR title ~* '\bbuyer''?s?\s*guide\b'
      OR title ~* '\bbest\s.*(?:software|tools|platforms|solutions|alternatives|vendors)\b'
      OR title ~* '^\d+\s*(?:best|top)\b'
      OR title ~* '\btop\s*\d+\b'
      OR title ~* '\bside[- ]by[- ]side\b'
      OR title ~* '\b(?:implementation|configuration|setup|how[- ]to|tutorial)\s*guide\b'
      OR title ~* '\bbest\s*practices\b'
      OR title ~* '\bhonest\s*(?:review|comparison)\b'
      OR source_url ~* '/compare/|/comparison|/vs[-_/]|[-_]vs[-_]|/alternatives?(?:[-_/]|$)|[-_]alternatives?(?:[-_/]|$)|/competitors?(?:[-_/]|$)|[-_]competitors?(?:[-_/]|$)|/best[-_]|/buyers?[-_]guide|/reviews?(?:[-_/]|$)'
    )
);

DELETE FROM public.news_items
WHERE item_type = 'news'
  AND (
    title ~* '\bvs\.?\b'
    OR title ~* '\bversus\b'
    OR title ~* '\bcompare(?:d|s)?\b'
    OR title ~* '\bcomparison\b'
    OR title ~* '\balternatives?\b'
    OR title ~* '\bcompetitors?\b'
    OR title ~* '\bbuyer''?s?\s*guide\b'
    OR title ~* '\bbest\s.*(?:software|tools|platforms|solutions|alternatives|vendors)\b'
    OR title ~* '^\d+\s*(?:best|top)\b'
    OR title ~* '\btop\s*\d+\b'
    OR title ~* '\bside[- ]by[- ]side\b'
    OR title ~* '\b(?:implementation|configuration|setup|how[- ]to|tutorial)\s*guide\b'
    OR title ~* '\bbest\s*practices\b'
    OR title ~* '\bhonest\s*(?:review|comparison)\b'
    OR source_url ~* '/compare/|/comparison|/vs[-_/]|[-_]vs[-_]|/alternatives?(?:[-_/]|$)|[-_]alternatives?(?:[-_/]|$)|/competitors?(?:[-_/]|$)|[-_]competitors?(?:[-_/]|$)|/best[-_]|/buyers?[-_]guide|/reviews?(?:[-_/]|$)'
  );

-- Also clear any pending queue rows that match these spam patterns so the next
-- hydrate pass doesn't re-create them.
UPDATE public.news_ingestion_queue
SET status = 'filtered',
    last_error = 'pre_seeded_comparison_or_listicle'
WHERE status IN ('pending', 'processing')
  AND (
    title ~* '\bvs\.?\b'
    OR title ~* '\bversus\b'
    OR title ~* '\bcompar(?:e|ison)\b'
    OR title ~* '\balternatives?\b'
    OR title ~* '\bcompetitors?\b'
    OR title ~* '\bbuyer''?s?\s*guide\b'
    OR title ~* '\bbest\s.*(?:software|tools|platforms|solutions|alternatives|vendors)\b'
    OR source_url ~* '/compare/|/comparison|/vs[-_/]|[-_]vs[-_]|/alternatives?|/competitors?|/best[-_]|/buyers?[-_]guide|/reviews?'
  );