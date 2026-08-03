---
name: response-contract
description: Executable contract gate that validates every Comp Agent draft (intent, structure, depth, citations, media scope, conditional sections, actionability, semantic completeness, evidence utilization, reference symmetry) and applies DETERMINISTIC-only repairs. No LLM on the repair path; LLM-as-Judge runs off-path.
type: feature
---
Every Comp Agent response passes through `_shared/response-contract.ts` before persist/stream finalize. Steps: A) intent classification, B) structural check, C) media scoping, D) depth check, E) citation check (deep-URL rule — domain-only links trip a `block`), F) conditional sections (Community Sentiment triplet), G) actionability, **D6.1 semantic completeness** (terminal-punctuation + table-row integrity), **D6.2 evidence utilization** (block "not evidenced" near manifest slugs), **D6.3 reference symmetry** (comparison Sources must cite every party hostname incl. workday.com), H) deterministic repair, I) verdict `pass`/`repaired_deterministic`/`failed`/`skipped`.

**Repair LLM REMOVED (deprecated).** There is no LLM on the repair path — it was deleted to eliminate the on-critical-path latency gate (was bounded 10s, gated the `content` SSE event). Repairs are now purely deterministic and synchronous (≈0ms): only `structural` and `citation` rules are repairable. Other violations (depth, actionability, media_scope, conditional_section, semantic_completeness, evidence_utilization, reference_symmetry) are recorded; if blocking, verdict is `failed` and the draft ships unchanged. `repairTimeoutMs`, the truncation/empty retry paths, and the `repaired`/`regenerated`/`repair_timeout` verdicts no longer exist.

**Deterministic repairs:** (1) `stripEmptyHrefSources` — unconditional pre/post pass removing dead `[Source]()` links; (2) structural fixer prepends `## Findings` / `## Sources`; (3) citation fixer appends a `## Sources` block from `ctx.crawledUrls` (top 10 deep URLs, hostname+path label). Any change marks verdict `repaired_deterministic`.

**Crawled deep URLs** are extracted from `webIntel` in `chat-analysis/index.ts` and passed via `ContractContext.crawledUrls`; the deterministic citation fix uses them to backfill a Sources block when missing.

**D3 Evidence Manifest** — `chat-analysis` builds `{title,url,slug}[]` from `mediaContext` (markdown images + `(from URL)` markers) and: (a) injects it into the analyst system prompt as `## RETRIEVED VISUAL EVIDENCE`, (b) passes it to `ContractContext.evidenceManifest` for D6.2 scoring. The synthesizer may emit up to 3 `<<NEEDS_SCRAPE: url>>` control tokens; orchestrator scrapes them via `firecrawl-scrape` and re-invokes synthesis once with a `## DEEP-SCRAPED EVIDENCE` block appended.

**D5 Community Sentiment trigger (triplet)** — section is required when ANY of: T1 Full Product comparison (`type=comparison` AND `scope=broad`); T2 user explicitly asked (`asksCommunity=true`); T3 narrow draft cites a community-class source (community.*, reddit/linkedin/g2/gartner/trustradius/capterra). Feed-context fetch in `chat-analysis` also enables `includeCommunity` whenever T1 fires, not just T2.

Analyst prompt enforces **citation depth**: every URL must include a non-trivial path; domain-only links are rejected. Substantive responses must end with `## Sources`.

**Judge is off-path.** `chat-analysis` calls `runResponseContract` with `skipJudge:true`; `judgeResponse()` runs in the post-stream background task and is the single source of truth for `evaluation_scores` + `agent_traces.judge_scores`. `validate-trace` (admin-only, `scoreOnly:true`) judges inline since scoring is its purpose.

Privacy: only user_prompt + agent draft + crawled URLs sent externally (judge only). No Adaptive Planning training-guide content forwarded.

Re-validation surfaced in `/agent-traces` with ⚠ Repair Failed (`after_excerpt === "[no deterministic repair available]"`) and 🛠 Det. Repaired badges.
