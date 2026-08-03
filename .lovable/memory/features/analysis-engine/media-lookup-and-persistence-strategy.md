---
name: media-lookup-and-persistence-strategy
description: Gallery-first lookup with inline/fallback partitioning, narrow-intent override on inline-gallery miss, targeted crawl reusing screenshot-worker’s inline-first extraction, and a strict trust-boundary contract between screenshot-worker and the persistence layer.
type: feature
---
Gallery-first media lookup: for six priority competitors (OneStream, Anaplan, Planful, Oracle, SAP, Pigment) the agent normally skips live crawls and uses only `media_assets` matched on competitor + product_area + product_sub_area.

**Inline vs. fallback classification (`_shared/media-helpers.ts` → `buildGalleryResult`):**
Every gallery row is classified as either `inline` or `full_page_fallback`. A row is treated as fallback when ANY of:
- `metadata.capture_type === 'full_page_fallback'`
- `source_type === 'live-crawl-page-screenshot'`
- `alt_text` starts with `[Full-Page Capture` or `[Page Screenshot]`

Inline rows are emitted as `[Gallery Image]` and fallback rows as `[Gallery Image - Full-Page Fallback]`. The result returns `inlineCount` and `fallbackCount` separately, and `galleryMedia` is sorted inline-first so the LLM cites real product UI ahead of any legacy first-fold capture.

A one-time backfill tagged all legacy fallback rows with `metadata.capture_type='full_page_fallback'` so this classification is consistent across old and new media.

**Two-stage narrow-intent filtering (lookup + gate):**
1. **Lookup-time** (`getGalleryMedia` → `buildGalleryResult`): when `intent.scope === "narrow"` and `intent.entities` is non-empty, every candidate asset is matched against word-boundary regexes built from the entities. Haystack = `alt_text + product_sub_area + page_url`. Non-matching assets are dropped.
2. **Gate-time** (`_shared/response-contract.ts` step C): the contract re-validates the draft and drops any remaining off-topic media. >40% off-topic on narrow → `media_scope/block`; >6 media items on narrow → `media_scope/warn`.

**Gallery-only OVERRIDE → targeted live crawl:**
`shouldOverrideGalleryOnly(intent, galleryHits, inlineGalleryHits?)` returns true when ALL of: `intent.scope === "narrow"`, `intent.asksMedia === true` OR `intent.entities.length > 0`, AND the **effective hit count is 0**. The effective count is `inlineGalleryHits` when supplied (preferred) and falls back to `galleryHits` for legacy callers. This means a competitor whose only gallery rows are full-page fallbacks is treated as a miss → a fresh inline-first crawl is forced (`live_crawl_reason="narrow_intent_inline_gallery_miss"`). Fallback rows remain visible in the gallery as a last-resort visual but are never preferred over fresh inline media.

When triggered, `runTargetedLiveCrawl(competitor, entities, category, subCategory)` uses the **same inline-first extraction logic as `bulk-media-crawl`** by invoking `screenshot-worker` for each shortlisted page:
1. Build entity-scoped Firecrawl search queries: `"<competitor>" "<entity>" screenshot`, `site:<comp>.com <entity>`, `site:community.<comp>.com <entity>`, `site:docs.<comp>.com <entity>`.
2. Scrape top 3 result pages for **text intelligence only** (`markdown/html/links`) so entity-matched prose can ground the answer.
3. For media, call `screenshot-worker` per page. That worker is the canonical extraction path used by bulk import:
   - **Phase A (preferred):** extract inline markdown/HTML/srcset image candidates, download them with page context headers, pass them through the semantic inline-image classifier, then upload approved images to permanent storage as `/inline-*` assets.
   - **Phase B (fallback only if zero inline images were approved):** use worker-captured viewport screenshots from the same scrape and pass each through the screenshot vision gate.
4. `runTargetedLiveCrawl` labels worker output as `[Targeted Live Crawl]` for inline assets and `[Full-Page Capture (fallback)]` for screenshot fallback assets.
5. Persisted `media_assets` rows preserve `page_url`, `source_type`, and `metadata.capture_type` so future gallery lookups can distinguish inline media from fallback captures.

**Auto-deactivation of stale fallbacks (trace f960d48c fix):**
After `persistNewMediaToGallery` inserts at least one fresh `inline_images_first` row for a competitor + product_area, it queries every still-active row in the same `competitor + product_area` whose `source_type='live-crawl-page-screenshot'` OR `metadata.capture_type='full_page_fallback'`, runs the entity word-boundary regex against `alt_text + product_sub_area + page_url`, and bulk-sets `is_active=false` on every match. Deactivated rows are tagged with `metadata.deactivated_reason='superseded_by_fresh_inline'` and `superseded_by_entities=[…]`. This permanently retires legacy first-fold captures so the LLM never sees them again for that entity, while preserving them for audit.

**Relative-URL link repair (trace f960d48c fix):**
After disclaimer sanitization in `chat-analysis`, every markdown link `[label](href)` whose `href` is not absolute (`http://`/`https://`/`mailto:`/`tel:`/`#`) is repaired by suffix-matching `href` against every URL present in `mediaContext`. If a unique match is found the link is rewritten to the absolute URL; otherwise the link wrapping is stripped (label retained). This fixes cases where the LLM truncated a long source URL (e.g. `…/community-challenge/p1`) into a relative `/p1` href.

**Trust-boundary contract (trace 8096fa58 root-cause squasher):**
The `screenshot-worker` is the **sole image validator**. Its response includes an explicit `approved_assets: [{ url, capture_type: "inline" | "fallback" }]` array (alongside legacy `screenshot_urls` for backwards compat). `runTargetedLiveCrawl` consumes `approved_assets` directly — no substring-sniffing of `/inline-/` filenames. `persistNewMediaToGallery` parses each media line by splitting at the FINAL `": http"` (not a greedy first-match regex, which previously grabbed the `(from PAGE_URL)` HTML page URL and rejected every trusted asset as "non-image"). Lines starting with trusted tags (`[Targeted Live Crawl]`, `[Full-Page Capture (fallback)]`, `[Inline Image]`, `[Page Screenshot]`) bypass URL-shape validation entirely. Untrusted lines still require an image extension or the `competitor-screenshots` bucket path. Trusted-line parse failures log `WARN`; if every line is rejected, an `ERROR: persist contract mismatch` alarm fires with sample lines so contract drift surfaces immediately.

Privacy: only `competitor + entities + public web` are sent to Firecrawl/Tavily. No Adaptive Planning training-guide content leaves the system.
