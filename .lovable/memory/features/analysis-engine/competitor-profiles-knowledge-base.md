---
name: Competitor Profiles Knowledge Base
description: XLSX-ingested competitor_profiles + product_area_mappings drive UI dropdowns, SHEET-PROVIDED FACTS injection, sheet-backed competitor extraction for general queries, priority Firecrawl shallow-crawl seeds, FP&A scope guardrail, and Feed Agent coverage
type: feature
---
The XLSX-ingested `competitor_profiles` table (173 rows from `Workday_FP_A_Report.xlsx`) and `competitor_product_area_mappings` (871 rows) act as a shared ground-truth knowledge base across both agents.

**Wiring:**
1. **UI dropdowns** (`src/lib/seed-data.ts`): `getSeedCompetitors` merges hard-coded seeds with profiles by category/sub_category. Full Product → Full Product gets all 173.
2. **Sheet-backed competitor extraction for general queries** (`chat-analysis/index.ts`): When no competitor is selected, `findProfilesInText(message)` matches the message against ALL 173 sheet names (whole-word, longest-name-first, alias-aware via `extra.Company`). This replaced an old hardcoded ~15-name `KNOWN_COMPETITORS` map that caused free-form queries about Aleph/Campfire/etc. to bypass the KB entirely.
3. **Comp Agent prompt** (`chat-analysis/index.ts`): Injects `--- SHEET-PROVIDED FACTS ---` block via `formatProfilesForPrompt`. Token guard: full facts if ≤3 competitors, condensed otherwise. Prompt instructs the LLM to treat these as ground truth.
4. **Priority Firecrawl seed** (`_shared/intelligence-helpers.ts` → `gatherLiveIntelligenceAndMedia`): Sheet `website` runs as a SHALLOW CRAWL (`/v1/crawl`, limit 8, maxDepth 2, polled up to 25s, aggregated truncated to 12k chars) BEFORE Anthropic discovery. Typed `links` get single-page `/scrape`. Existing Firecrawl + Anthropic paths still run unchanged.
5. **FP&A scope guardrail** (`chat-analysis/index.ts`): If the user picked the generic "General/General" charter AND no sheet competitor matched AND the message has zero FP&A/EPM/finance/planning lexicon, the agent short-circuits with a polite redirect — no Claude/Firecrawl spend. Vendors in the sheet are IN scope by definition. The system prompt also enforces the same guardrail at generation time.
6. **Feed Agent coverage** (`_shared/news-queue.ts`): `ensureCompetitorNamesLoaded()` unions COMPETITOR_NAMES with all sheet profile names per discovery run.

Shared accessor: `_shared/competitor-profiles.ts` (5-min in-memory cache; exports `getAllProfiles`, `getProfilesByNames`, `findProfilesInText`, `formatProfilesForPrompt`, `getPriorityUrls`). Profiles never leak Workday Adaptive Planning training data — only public competitor metadata.
