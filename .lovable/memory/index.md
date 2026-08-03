# Memory: index.md
Updated: just now

# Project Memory

## Core
- **Product:** Sentinel — *Competitive Intelligence, On Watch.* Sub-brands "Comp Intelligence Agent" / "Comp Intel Feed" / "Feed Agent" remain unchanged.
- **Mission:** Competitive Intelligence Copilot for Workday Adaptive Planning. Training guide is ground truth.
- **Persona:** Never punt research to user, no disclaimers, no empty tables/templates. Synthesize findings or explicitly state "Not found".
- **Theme:** Dark futuristic — deep ink + electric cyan (188 92% 54%) + violet (258 80% 66%). Aurora background, scan-sweep, click ripple. Cream is forbidden.
- **Media Policy:** Prioritize high-quality product UI. Enforce 7+ quality score. Must share crawled media in chat for user verification.
- **Auth:** Restricted strictly to @workday.com domain. App-specific passwords required.
- **Responses:** Nested list hierarchies. Conditional sections honor user intent — Community Sentiment ONLY when asked.
- **Gallery-only fallback:** Gallery-only competitors fall back to targeted Firecrawl live crawl on narrow-intent zero-hit (asksMedia + entities + 0 gallery matches).
- **Deduplication:** Forbid listing multiple variations of same vendor during search. Use canonical brand names.
- **Image rendering:** All `<img>` MUST go through `SmartImage`. Never use `e.currentTarget.style.display = "none"` in onError — it permanently hides nodes on transient CDN failures.

## Memories
- [SmartImage usage rule](mem://style/visual-direction/smart-image) — Mandatory image primitive: bounded retries, IO lazy-load, React-rendered fallback
- [Sentinel Brand](mem://product/branding/sentinel-product-brand) — Product name Sentinel, tagline "Competitive Intelligence, On Watch.", animated gradient wordmark
- [Sentinel Theme](mem://style/visual-direction/sentinel-theme) — Cyan/violet tokens, SentinelBackground (aurora+orbs+scan), SentinelClickRipple
- [Reddit Data](mem://tech/external-data-sources/reddit) — Estimate post dates using base36 ID sequence, 365-day clamp
- [YouTube Transcripts](mem://tech/external-data-sources/youtube) — Direct internal endpoint calls to bypass Data API keys
- [Scraping Strategy](mem://features/multimedia-support/scraping-strategy) — 300s timeout, live multi-format scrapes for fresh CDN URLs
- [Image Prioritization](mem://features/multimedia-support/prioritization-and-filtering) — Target docs subdomains, block video hosts/thumbnails
- [Feed Filtering](mem://features/news-feed/filtering-and-ranges) — Community bypasses date filters (1,000 items), news daily/weekly cron
- [Agent Identity](mem://product/branding/agent-identity) — Comp Agent & Feed Agent. 36px/72px avatar pre-loaded blob URL cache
- [Aesthetic Theme](mem://style/visual-direction/aesthetic-theme) — 3-layer parallax starfield, pulsating glow borders for assistants
- [Cascading Filters](mem://features/interface-ux/cascading-filters) — Full Product auto-locks. Multi-select max 2, background scan populates popover
- [Learning Loop](mem://features/analysis-engine/learning-loop) — Store liked responses, re-validate on query
- [Evaluation Engine](mem://features/analysis-engine/evaluation-engine) — LLM-as-Judge 7 criteria (Factual, Depth, Clarity, Actionability, Citation, Visual, Media)
- [Taxonomy Hierarchy](mem://product/mission-and-scope/taxonomy-hierarchy) — Level 1: Charter (product_area), Level 2: Product Area (product_sub_area)
- [Context Optimization](mem://tech/infrastructure/context-optimization-pipeline) — Top 6 chunks for area, Top 15 Full Product. Flash Lite summarization
- [Response Presentation](mem://features/interface-ux/response-presentation) — Short list items (<60 chars) as headers, tables without whitespace-nowrap in col 1
- [Thread Management](mem://features/interface-ux/thread-management) — Destructive dialog on delete, auto-create using first 60 chars of prompt
- [Profile & Auth](mem://auth/account-features/profile-and-auth) — h-12 Workday logo, h-16 profile icon, app-specific passwords
- [Performance Optimization](mem://tech/infrastructure/performance-optimization) — Dynamic truncation of cached intelligence strings based on competitor count
- [Security Architecture](mem://tech/infrastructure/security-architecture) — RLS owner-or-admin, hardcoded Agent Traces credential
- [Observability Dashboard](mem://tech/infrastructure/observability-dashboard) — /admin/api-credits, first-seen baseline for Firecrawl balance
- [Verification Process](mem://workflow/media/verification-process) — Media must be shared directly in chat
- [Community Sentiment Section](mem://features/analysis-engine/community-intelligence-section) — Mandatory when community items available (T4); also T1/T2/T3
- [Media Quality Gate](mem://features/multimedia-support/quality-gate-scoring) — 7+ score required, 1 for faces/generic UI
- [PowerPoint Exports](mem://features/interface-ux/export-capabilities) — Archivo font, 5.65-inch zone, GPT-5.2 zero-truncation, split-slide media layout
- [API Management](mem://tech/infrastructure/api-management-rotation-and-monitoring) — Firecrawl keys 1,3,4. Sequential failover on 402 error
- [Newsletters](mem://features/marketing/newsletters-and-digests) — Resend daily digest HTML summary
- [Models and Tools](mem://tech/ai-architecture/models-and-tools) — GPT-5.2 for agents, GPT-5-nano for intent, Anthropic for vision/search
- [User Identity](mem://style/visual-direction/user-identity) — Custom avatars to Supabase bucket, localStorage cache
- [Navigation State](mem://features/interface-ux/navigation-and-state) — min-w-0 main chat, standard div fixed-width sidebar
- [Media Persistence](mem://tech/infrastructure/media-persistence-strategy) — 96h migration to Supabase, daily 03:00 UTC cleanup
- [Media Gallery](mem://features/multimedia-support/media-management-and-gallery) — Lightbox with fixed-position navigation, keyboard shortcuts
- [Gallery Lookup + Live Crawl Fallback](mem://features/analysis-engine/media-lookup-and-persistence-strategy) — Gallery-first; narrow-intent zero-hit overrides gallery-only and runs targeted Firecrawl crawl
- [Media Integrity](mem://tech/infrastructure/media-data-integrity-safeguards) — Byte-diversity check: first 2KB needs 10+ unique bytes
- [Semantic Deduplication](mem://tech/infrastructure/competitor-semantic-deduplication) — LLM prompt rules to prevent multiple variations of same vendor
- [YouTube Discovery](mem://features/multimedia-support/youtube-discovery-constraints) — Official channels, quoted queries, min 2-char matching
- [Hotlink Bypass](mem://tech/infrastructure/media-persistence-hotlink-bypass-logic) — Multi-stage fetch with custom headers, no-referrer
- [Agent Persona](mem://product/branding/agent-persona-and-sanitization) — Confident insights, no disclaimers/frameworks
- [Smart Auto-Scroll](mem://features/interface-ux/smart-auto-scroll) — Pauses if user manually scrolls up
- [Saved Items](mem://features/news-feed/saved-items) — Flying bookmark React Portal animation to profile icon
- [Silent Generation](mem://features/interface-ux/chat-behavior-silent-generation) — No layout animations when appending message fragments
- [Logos](mem://product/branding/logos) — 2:1 ratio. Dark on light, white on dark (Ink) backgrounds
- [Intent Detection](mem://tech/ai-architecture/intent-detection) — Regex pre-pass (competitor + sub-area dictionaries) + GPT-5 with few-shot. Regex wins on positives.
- [Color Palette](mem://product/branding/color-palette) — Ink, Paper, Blue Sky. No cream
- [Research Modes](mem://features/interface-ux/research-modes) — Pill segmented control unmounts conditionally. Hidden when session active
- [Maintenance Schedule](mem://tech/infrastructure/maintenance-schedule) — Cron: News daily 00:00, Community daily 04:00 UTC, Media cleanup 03:00, Persistence 96h
- [Edge Function Modularization](mem://tech/infrastructure/edge-function-modularization) — Extracted to _shared/ to beat 128KB limit
- [Feed Data Quality](mem://features/news-feed/data-quality-and-latency) — verify-dates fallback, block generic listicles
- [Feed Context](mem://features/feed-agent/interface-and-context) — Excludes time-range labels for community. Formal cancellation message on Stop
- [Agent Traces Dashboard](mem://tech/infrastructure/agent-traces-dashboard) — Adds Live Crawl, Slide Summary, Gallery Filtered columns alongside Violations + Judge Failure
- [Feedback System](mem://features/interface-ux/feedback-system) — Hide votes for streaming/cancel. Prioritize traceIds prop mapping
- [Thread Isolation](mem://tech/infrastructure/thread-isolation-and-state-integrity) — Per-thread state (activeThreadIdRef) allows background concurrency
- [SSE Event Pipeline](mem://tech/ai-architecture/sse-event-pipeline) — Early-emission traceId metadata written to chat_messages.metadata
- [Notifications](mem://style/ui-patterns/notifications) — sonner library, 2-second auto-dismissal
- [Content Ingestion](mem://tech/infrastructure/content-ingestion-architecture) — fetch-community self-chaining (batches of 2), specific social whitelists
- [Feed Search Pipeline](mem://tech/ai-architecture/feed-agent-search-pipeline) — Claude web search -> Firecrawl markdown extraction from top 3 pages
- [General Research](mem://features/analysis-engine/general-research-capabilities) — Hybrid pipeline using GPT-5 Nano semantic evaluation for live web search
- [Response Contract](mem://features/analysis-engine/response-contract) — Deterministic-only repair (LLM repair removed), off-path judge, structural/citation fixes
