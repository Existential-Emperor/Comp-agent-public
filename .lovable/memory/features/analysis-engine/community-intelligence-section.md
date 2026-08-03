---
name: community-intelligence-section
description: Conditional Community Sentiment section + curated Feed evidence (news always, community when intent.asksCommunity) injected into Comp Agent context from news_items table.
type: feature
---
The `## Community Sentiment` section in Comp Agent responses is CONDITIONAL — included only when intent.asksCommunity=true (sentiment/reviews/Reddit/LinkedIn/community/perception/Gartner/G2/TrustRadius/Capterra mentions). For other queries it's omitted to honor user intent.

**Comp Agent ↔ Feed bridge** (`_shared/feed-context.ts` → wired in `chat-analysis/index.ts`):
- After competitor resolution, `fetchFeedEvidenceForCompetitors(supa, names, opts)` queries `news_items` filtered by `source_name ILIKE` competitor names + `published_at >= now() - 90d`.
- Returns two compact blocks (≤3KB each): `## FEED-CURATED NEWS (last 90 days)` (always injected when ≥1 competitor) and `## COMMUNITY SIGNALS (last 90 days)` (gated by `intent.asksCommunity`).
- Each item line: `- [YYYY-MM-DD] title — source_name — source_url` + truncated 240-char summary.
- Item URLs are unioned into the response-contract `crawledUrls` set so citation repair / deterministic Sources fallback can use them.
- Trace metadata records `feed_news_count` + `feed_community_count`.

Analyst prompt has a FEED EVIDENCE PRIORITY rule telling the LLM to prefer these dated, source-attributed URLs as primary citations for recency/sentiment/news questions.

Privacy: only public news_items rows forwarded; no Adaptive Planning KB content sent externally.
