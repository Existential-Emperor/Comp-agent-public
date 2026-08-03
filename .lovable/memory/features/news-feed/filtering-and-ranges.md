---
name: filtering-and-ranges
description: Four-layer deterministic news filter + LLM final gate. Community bypasses date filters. Daily cron schedule.
type: feature
---

## News filter pipeline (4 deterministic layers + LLM gate)

Implemented in `_shared/news-queue.ts` (deterministic) and `_shared/news-quality-scorer.ts` (LLM):

1. **Structural** — social domains, listing/aggregator URL shapes, dup-in-batch.
2. **Identity** — whole-word `\b…\b` competitor + alias matching (no substring collisions like "highlights" → "Light").
3. **Locale** — English-only via `isLikelyEnglish`.
4. **Genre + Substance** — `classifyGenre` (product/financial/research/other) + product-keyword proximity (~120 chars from competitor mention).

Pipeline integration:
- `news-discover`: full chain on SERP results.
- `news-hydrate`: re-runs Identity + Genre + Substance on scraped body.
- `news-finalize`: **LLM quality gate** (`gateNewsItems`, GPT-5 via Lovable AI Gateway) over claimed batch before insert. Scores subjecthood, genre_fit, substance, independence (0-10 each). Pass: total ≥ 24/40 AND subjecthood ≥ 6 AND genre_fit ≥ 6. Sub-scores persisted on `news_items.quality_*` columns. On LLM failure (429/402/parse), falls back to deterministic verdict — pipeline never stalls.

Fixture suite at `_shared/__tests__/news-quality-scorer_test.ts` (16 cases, ≥14/16 pass criteria). Append new slips/false-rejects to grow the suite.

## Date ranges
- News items: rolling 365-day window (`oneYearAgo` floor, `tomorrow` ceiling) enforced in `news-finalize`.
- Community items: bypass date filters (sentiment value isn't time-bounded).

## Cron
- News: twice daily — 00:00 UTC (`fetch-news-daily`) and 12:01 UTC (`fetch-news-daily-1201utc`), both `force=true`. Entry point `fetch-news` orchestrates `news-discover` → `news-hydrate` → `news-finalize`. The 12:01 pass re-catches same-day announcements not yet SERP-ranked at midnight. `fetch-news` skips non-force calls outside the 00:00 window, so the second job must pass `force=true`.
- Community: daily 04:00 UTC (`force=true`).
