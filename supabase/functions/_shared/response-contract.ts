// Response Contract Layer — the executable gate every Comp Agent response
// passes through before being persisted/streamed to the user.
//
// One module, seven criteria. Validates the LLM draft against the user intent
// and applies DETERMINISTIC, zero-latency repairs only (heading/Sources structure,
// crawled-URL citation backfill, empty-href sanitization). There is no LLM on the
// repair path — it was deprecated to remove the on-critical-path latency gate.
// The LLM-as-Judge runs off-path (see judgeResponse) and never gates stream close.
//
// PRIVACY: Only the user prompt + the agent draft are sent to the LLM gateway.
// NO Adaptive Planning training-guide / RAG context is forwarded externally.

import { classifyQueryIntent, buildEntityMatchers, type QueryIntent } from "./query-intent.ts";
import { evaluateResponse, type JudgeEvaluation } from "./judge-helpers.ts";

export interface EvidenceManifestEntry {
  /** Human-readable title shown in the gallery (used as `[label]` in the manifest block). */
  title: string;
  /** Source page URL (deep link) for this evidence item. */
  url: string;
  /** Stable slug derived from the URL — used by the evidence_utilization invariant. */
  slug: string;
}

export interface ContractContext {
  competitor: string;
  category: string;
  subCategory: string;
  /** Deep URLs (with non-trivial paths) collected from live crawls — used by the
   *  deterministic citation fix to backfill a '## Sources' block with real evidence
   *  paths when the draft omits one. */
  crawledUrls?: string[];
  /** D3: Visual evidence already shown to the user (manifest of media URLs + titles + slugs).
   *  Used for the evidence_utilization invariant in D6. */
  evidenceManifest?: EvidenceManifestEntry[];
  /** D5/D6 reference_symmetry: when this is a comparison, every named party's hostname
   *  must appear in the Sources block. Workday/Adaptive is implicit; pass the *competitor*
   *  hostnames here (e.g. ["anaplan.com"]) so the validator can enforce both sides. */
  comparisonHostnames?: string[];
  /** D5 trigger T4: real community/user-discussion items were retrieved for the
   *  resolved competitor(s). When true, a "## Community Sentiment" section is
   *  mandatory regardless of intent — items are available, so they must be summarized. */
  communityItemsAvailable?: boolean;
}

export interface ContractViolation {
  rule: string;          // structural | depth | citation | media_scope | actionability | conditional_section
  severity: "warn" | "block";
  detail: string;
}

export interface RepairLogEntry {
  rule: string;
  before_excerpt: string;
  after_excerpt: string;
}

export interface ContractResult {
  final: string;                       // the response after repairs (may equal draft)
  intent: QueryIntent;
  violations: ContractViolation[];     // detected before any repair
  repairs: string[];                   // human-readable list of repairs applied
  repairLog: RepairLogEntry[];         // structured before/after excerpts per repair attempt
  scores: JudgeEvaluation | null;      // LLM-as-Judge result; null when judge ran off-path (skipJudge) or failed
  judgeFailureReason: string | null;   // populated when scores === null
  verdict: "pass" | "repaired_deterministic" | "failed" | "skipped";
  repairMs: number;                    // wall-clock ms spent applying deterministic repairs (≈0)
  judgeMs: number;                     // wall-clock ms spent in the synchronous judge call (0 when judge skipped)
}

// ---------------------- A. INTENT (re-export) ----------------------

// ---------------------- B/C/D/E/F/G. STATIC CHECKS ----------------------

const HEADING_RE = /^##\s+/m;
const MARKDOWN_IMG_RE = /!\[[^\]]*\]\([^)]+\)/g;
const URL_RE = /https?:\/\/[^\s)]+/gi;

// ---------------------- ROADMAP TAGGING (output-based, per-sentence) ----------------------
// A sentence is roadmap-derived iff it carries an inline `[roadmap: …]` citation
// marker (the same mechanic the analyst uses for `[Source: …]`). The contract's
// only job is the structural coupling: every sentence with a `[roadmap: …]`
// marker must also carry the user-visible `(roadmap)` suffix. No input/injection
// signal, no filename matching — the marker is the signal.
const ROADMAP_MARKER_RE = /\[roadmap:[^\]]*\]/i;
const ROADMAP_SUFFIX_RE = /\(roadmap\)/i;

// Abbreviations whose trailing period must NOT be treated as a sentence boundary.
const SENTENCE_ABBREVIATIONS = new Set([
  "inc", "ltd", "co", "corp", "llc", "plc", "e.g", "i.e", "etc", "vs", "vs.",
  "mr", "mrs", "ms", "dr", "prof", "sr", "jr", "st", "approx", "est", "dept",
  "fig", "no", "vol", "gov", "u.s", "u.k", "jan", "feb", "mar", "apr", "jun",
  "jul", "aug", "sep", "sept", "oct", "nov", "dec",
]);

function isRealSentenceBoundary(text: string, i: number): boolean {
  const prev = text[i - 1];
  const next = text[i + 1];
  // Decimal like "3.5" — digit . digit is never a boundary.
  if (prev && /\d/.test(prev) && next && /\d/.test(next)) return false;
  // Preceding token (letters + internal dots) — abbreviation check.
  let k = i - 1;
  let token = "";
  while (k >= 0 && /[A-Za-z.]/.test(text[k])) { token = text[k] + token; k--; }
  token = token.replace(/\.+$/, "").toLowerCase();
  if (token && SENTENCE_ABBREVIATIONS.has(token)) return false;
  // Single-letter token (e.g. "J. Smith") — treat as initial, not a boundary.
  if (token.length === 1 && /[a-z]/.test(token)) return false;
  return true;
}

// Segment into contiguous sentence spans covering [0, text.length). A standalone
// trailing "(roadmap)" (i.e. the suffix emitted AFTER the terminal period) is
// merged back into the preceding sentence so marker-placement is tolerated:
// both "sentence. (roadmap)" and "sentence (roadmap)." resolve to one span.
function segmentSentences(text: string): Array<{ start: number; end: number }> {
  const spans: Array<{ start: number; end: number }> = [];
  const n = text.length;
  let start = 0;
  let i = 0;
  let bracketDepth = 0;
  let parenDepth = 0;
  while (i < n) {
    const c = text[i];
    if (c === "[") bracketDepth++;
    else if (c === "]") bracketDepth = Math.max(0, bracketDepth - 1);
    else if (c === "(") parenDepth++;
    else if (c === ")") parenDepth = Math.max(0, parenDepth - 1);
    else if ((c === "." || c === "!" || c === "?") && bracketDepth === 0 && parenDepth === 0) {
      if (isRealSentenceBoundary(text, i)) {
        let j = i + 1;
        while (j < n && /[.!?"'”’)\]]/.test(text[j])) j++;
        while (j < n && /\s/.test(text[j])) j++;
        spans.push({ start, end: j });
        start = j;
        i = j;
        continue;
      }
    }
    i++;
  }
  if (start < n) spans.push({ start, end: n });

  // Merge a standalone trailing "(roadmap)" span into the previous sentence.
  const merged: Array<{ start: number; end: number }> = [];
  for (const s of spans) {
    const t = text.slice(s.start, s.end).trim();
    if (merged.length > 0 && /^\(roadmap\)[\s.!?"'’”)\]]*$/i.test(t)) {
      merged[merged.length - 1].end = s.end;
    } else {
      merged.push({ ...s });
    }
  }
  return merged;
}

// Deterministic Bucket-1 repair: append "(roadmap)" inside the sentence boundary
// (consistent form: "sentence (roadmap).") for every roadmap-cited sentence
// missing the suffix. No LLM, synchronous.
function deterministicRoadmapFix(draft: string): string {
  const spans = segmentSentences(draft);
  let out = "";
  let cursor = 0;
  for (const s of spans) {
    out += draft.slice(cursor, s.start);
    const seg = draft.slice(s.start, s.end);
    if (ROADMAP_MARKER_RE.test(seg) && !ROADMAP_SUFFIX_RE.test(seg)) {
      const m = seg.match(/^([\s\S]*?)([.!?]+["'”’)\]]*)(\s*)$/);
      if (m) {
        out += `${m[1].replace(/\s+$/, "")} (roadmap)${m[2]}${m[3]}`;
      } else {
        const m2 = seg.match(/^([\s\S]*?)(\s*)$/)!;
        out += `${m2[1].replace(/\s+$/, "")} (roadmap)${m2[2]}`;
      }
    } else {
      out += seg;
    }
    cursor = s.end;
  }
  out += draft.slice(cursor);
  return out;
}


export function detectViolations(draft: string, intent: QueryIntent, ctx: ContractContext): ContractViolation[] {
  const v: ContractViolation[] = [];
  const trimmed = draft.trim();

  // B. STRUCTURAL — needs at least one H2 heading; prose must lead, not media.
  // For substantive responses (>150 words) zero headings is a BLOCK, not a warn,
  // so the repair pass actually rewrites it instead of letting wall-of-text through.
  const wc = trimmed.split(/\s+/).length;
  if (!HEADING_RE.test(trimmed)) {
    const sev: "warn" | "block" = wc > 150 ? "block" : "warn";
    v.push({ rule: "structural", severity: sev, detail: `No '## ' section heading found (${wc} words).` });
  }
  const firstNonEmpty = trimmed.split(/\n+/).find(l => l.trim().length > 0) || "";
  if (MARKDOWN_IMG_RE.test(firstNonEmpty)) {
    MARKDOWN_IMG_RE.lastIndex = 0;
    v.push({ rule: "structural", severity: "block", detail: "Response opens with a media block before any prose." });
  }
  MARKDOWN_IMG_RE.lastIndex = 0;

  // C. MEDIA SCOPING — when narrow, every media item should reference the entities
  if (intent.scope === "narrow" && intent.entities.length > 0) {
    const matchers = buildEntityMatchers(intent.entities);
    const imgMatches = [...trimmed.matchAll(MARKDOWN_IMG_RE)];
    MARKDOWN_IMG_RE.lastIndex = 0;
    let offTopic = 0;
    for (const m of imgMatches) {
      const block = m[0];
      const hits = matchers.some(re => re.test(block));
      if (!hits) offTopic++;
    }
    if (imgMatches.length > 0 && offTopic / imgMatches.length > 0.4) {
      v.push({
        rule: "media_scope",
        severity: "block",
        detail: `${offTopic}/${imgMatches.length} media items do not match narrow entities [${intent.entities.join(", ")}].`,
      });
    }
    // Also: too many media for a narrow query (the "40 screenshot dump" symptom)
    if (imgMatches.length > 6) {
      v.push({
        rule: "media_scope",
        severity: "warn",
        detail: `Narrow query returned ${imgMatches.length} media items — likely over-broad.`,
      });
    }
  }

  // D. DEPTH — comparison/feature queries need at least one vs-Adaptive contrast line
  if (intent.asksComparison || intent.type === "comparison" || intent.type === "feature_deep_dive") {
    const adaptiveMention = /\b(adaptive(?:\s+planning)?|workday)\b/i.test(trimmed);
    const bulletCount = (trimmed.match(/^\s*[-*•]\s+/gm) || []).length;
    if (!adaptiveMention) {
      v.push({ rule: "depth", severity: "block", detail: "Comparison query missing any vs-Adaptive contrast." });
    }
    if (intent.depthExpected === "high" && bulletCount < 4) {
      v.push({ rule: "depth", severity: "warn", detail: `High-depth query returned only ${bulletCount} bullet points.` });
    }
  }

  // E. CITATION — every factual paragraph SHOULD have at least one inline URL
  // with a non-trivial path segment. Pure domain-only links like
  // https://community.anaplan.com/ are not real evidence and trip a repair.
  const allUrls = trimmed.match(URL_RE) || [];
  const deepUrls = allUrls.filter((u) => {
    try {
      const path = new URL(u).pathname;
      return path && path !== "/" && path.length > 1;
    } catch { return false; }
  });
  const wordCount = trimmed.split(/\s+/).length;
  if (wordCount > 120 && deepUrls.length === 0) {
    if (allUrls.length > 0) {
      v.push({ rule: "citation", severity: "block", detail: `Substantive response cites ${allUrls.length} URL(s) but none have a real page path — domain-only links are not evidence.` });
    } else {
      v.push({ rule: "citation", severity: "warn", detail: "Substantive response with zero source URLs." });
    }
  }
  // E2. CITATION — empty-href markdown links like `[Source]()` or `[Source]( )`
  // are placeholders the model emits when it runs out of confident URLs.
  // They render as dead links / raw text in the UI. Always block + repair.
  const emptyHrefMatches = trimmed.match(/\[[^\]]+\]\(\s*\)/g) || [];
  if (emptyHrefMatches.length > 0) {
    v.push({
      rule: "citation",
      severity: "block",
      detail: `Response contains ${emptyHrefMatches.length} empty-href markdown link(s) (e.g. [Source]()). Empty placeholders are not citations.`,
    });
  }

  // F. CONDITIONAL SECTIONS — Community Sentiment trigger (D5):
  //   T1: Full Product comparison (intent.type=comparison AND scope=broad)
  //   T2: User explicitly asked for community/sentiment (intent.asksCommunity)
  //   T3: Narrow scope but the draft itself cites a community-class source
  //       (community.*, reddit.*, linkedin.*, g2.*, gartner, trustradius, capterra)
  //       — if cited, the response must summarize them in a Community Sentiment header.
  //   T4: Real community items were retrieved for the competitor(s)
  //       (ctx.communityItemsAvailable) — when items exist they are mandatory.
  const COMMUNITY_SOURCE_RE = /\b(?:community\.[a-z0-9-]+\.[a-z]+|reddit\.com|linkedin\.com|g2\.com|gartner\.com|trustradius\.com|capterra\.com)/i;
  const hasCommunitySection = /##\s+Community Sentiment/i.test(trimmed);
  const isFullProductComparison = intent.type === "comparison" && intent.scope === "broad";
  const cititesCommunitySource = COMMUNITY_SOURCE_RE.test(trimmed);

  if (ctx.communityItemsAvailable && !hasCommunitySection) {
    v.push({ rule: "conditional_section", severity: "block", detail: "Community items are available for this competitor — response must include a '## Community Sentiment' section summarizing them (D5 trigger T4)." });
  } else if (isFullProductComparison && !hasCommunitySection) {
    v.push({ rule: "conditional_section", severity: "block", detail: "Full Product comparison must include a '## Community Sentiment' section (D5 trigger T1)." });
  } else if (intent.asksCommunity && !hasCommunitySection) {
    v.push({ rule: "conditional_section", severity: "block", detail: "User asked for community/sentiment but section is missing (D5 trigger T2)." });
  } else if (intent.scope === "narrow" && cititesCommunitySource && !hasCommunitySection) {
    v.push({ rule: "conditional_section", severity: "block", detail: "Response cites community sources (Reddit/LinkedIn/G2/etc.) but has no '## Community Sentiment' summary (D5 trigger T3)." });
  }

  // G. ACTIONABILITY — competitive queries need a "what this means" line
  if (intent.asksComparison || intent.type === "comparison" || intent.type === "feature_deep_dive") {
    const hasTakeaway = /\b(what this means|so[- ]what|takeaway|implication|positioning|talk track|sales angle|seller(?:s)?)\b/i.test(trimmed);
    if (!hasTakeaway) {
      v.push({ rule: "actionability", severity: "warn", detail: "Competitive response lacks an explicit seller takeaway." });
    }
  }

  // G2. ACTIONABILITY (media_only) — must end with concrete next-steps or source URL list
  if (intent.type === "media_only" || intent.asksMedia) {
    const tail = trimmed.slice(-600).toLowerCase();
    const hasNextSteps = /(next steps|to capture|where to look|search (?:queries|terms)|try (?:this|searching)|sources?:|source urls?|reference urls?)/i.test(tail);
    const tailUrls = (trimmed.slice(-800).match(URL_RE) || []).length;
    if (!hasNextSteps && tailUrls < 2) {
      v.push({ rule: "actionability", severity: "block", detail: "Media-only response missing concrete next-steps or source URL list at the end." });
    }
  }

  // ---------------------- D6 INVARIANTS ----------------------

  // D6.1 SEMANTIC COMPLETENESS — terminal punctuation + table-row integrity.
  // Catches the "additionally, Anaplan is marketing a suite of" mid-clause cut.
  if (wc > 60) {
    const lastNonEmpty = trimmed.split(/\n+/).reverse().find((l) => l.trim().length > 0) || "";
    const tail = lastNonEmpty.replace(/[\)\]\*_`>"'\s]+$/, "");
    if (tail.length > 0 && !/[.!?…]$/.test(tail) && !/^[#\-*|]/.test(lastNonEmpty.trim())) {
      v.push({ rule: "semantic_completeness", severity: "block", detail: `Response ends mid-sentence (last line: "${lastNonEmpty.trim().slice(-80)}").` });
    }
    const brokenRows = trimmed.split("\n").filter((l) => /^\s*\|/.test(l) && !/\|\s*$/.test(l));
    if (brokenRows.length > 0) {
      v.push({ rule: "semantic_completeness", severity: "block", detail: `${brokenRows.length} markdown table row(s) missing closing '|' (truncated mid-row).` });
    }
  }

  // D6.2 EVIDENCE UTILIZATION — if the manifest contains a slug and the draft
  // contains a "not evidenced" disclaimer near a topic that matches that slug,
  // we ignored evidence we already had.
  const manifest = ctx.evidenceManifest || [];
  if (manifest.length > 0) {
    const NOT_EVIDENCED_RE = /(not evidenced|details? not (?:available|provided|public|evidenced)|no public information|specific .{0,40} not (?:available|evidenced))/gi;
    const draftLower = trimmed.toLowerCase();
    const ignoredSlugs: string[] = [];
    for (const m of trimmed.matchAll(NOT_EVIDENCED_RE)) {
      const idx = m.index ?? 0;
      const window = draftLower.slice(Math.max(0, idx - 200), Math.min(draftLower.length, idx + 200));
      for (const entry of manifest) {
        const slugTokens = entry.slug.split(/[-_]+/).filter((t) => t.length >= 4);
        if (slugTokens.length === 0) continue;
        const matchCount = slugTokens.filter((t) => window.includes(t.toLowerCase())).length;
        if (matchCount >= Math.min(2, slugTokens.length)) {
          if (!ignoredSlugs.includes(entry.slug)) ignoredSlugs.push(entry.slug);
        }
      }
    }
    if (ignoredSlugs.length > 0) {
      v.push({
        rule: "evidence_utilization",
        severity: "block",
        detail: `Draft says "not evidenced" near topics already in the visual evidence manifest: ${ignoredSlugs.slice(0, 3).join(", ")}.`,
      });
    }
  }

  // D6.3 REFERENCE SYMMETRY — comparison responses must cite hostnames for
  // every named party (workday.com is implicit; competitor hostnames provided).
  if (intent.type === "comparison" || intent.asksComparison) {
    const sourcesBlockMatch = trimmed.match(/##\s+(?:Sources?|Reference\s*Links?)\b[\s\S]*$/i);
    const sourcesBlock = sourcesBlockMatch ? sourcesBlockMatch[0] : "";
    if (sourcesBlock) {
      const requiredHosts = ["workday.com", ...(ctx.comparisonHostnames || [])];
      const hostnamesInSources = new Set<string>();
      for (const u of sourcesBlock.match(URL_RE) || []) {
        try { hostnamesInSources.add(new URL(u).hostname.replace(/^www\./, "")); } catch { /* skip */ }
      }
      const missing = requiredHosts.filter((req) => {
        const reqClean = req.replace(/^www\./, "");
        return ![...hostnamesInSources].some((h) => h.endsWith(reqClean));
      });
      if (missing.length > 0) {
        v.push({
          rule: "reference_symmetry",
          severity: "block",
          detail: `Comparison Sources block missing hostname(s) for: ${missing.join(", ")}.`,
        });
      }
    }
  }

  // ROADMAP TAGGING — output-based, per-sentence (no LLM, no injection signal).
  // Every sentence carrying an inline `[roadmap: …]` citation marker must also
  // carry the user-visible `(roadmap)` suffix. The marker is the structural
  // signal the analyst is instructed to emit; this is the same shape as the
  // `[Source: …]` citation rule. Deterministically repairable (Bucket-1).
  {
    const sentences = segmentSentences(trimmed);
    let untagged = 0;
    for (const s of sentences) {
      const seg = trimmed.slice(s.start, s.end);
      if (ROADMAP_MARKER_RE.test(seg) && !ROADMAP_SUFFIX_RE.test(seg)) untagged++;
    }
    if (untagged > 0) {
      v.push({
        rule: "roadmap_tagging",
        severity: "block",
        detail: `${untagged} sentence(s) cite roadmap evidence ([roadmap: …]) without the required "(roadmap)" marker — future/unreleased capability must be tagged "(roadmap)".`,
      });
    }
  }


  return v;
}

// ---------------------- DETERMINISTIC REPAIR ----------------------
// The LLM repair path was deprecated. Repairs are now purely deterministic and
// synchronous: structural heading insertion and crawled-URL citation backfill.
// These add no external-call latency and never gate stream close.

function deterministicStructuralFix(draft: string): string {
  const lines = draft.split("\n");
  // Find first non-empty line index
  let firstIdx = 0;
  while (firstIdx < lines.length && lines[firstIdx].trim() === "") firstIdx++;
  // Find first line that looks like a [Source ...](http...) or "Sources:" marker
  let sourcesIdx = -1;
  for (let i = firstIdx; i < lines.length; i++) {
    if (/^\s*(?:\*\s*)?\[(?:source|reference|ref)\b/i.test(lines[i]) || /^sources?:/i.test(lines[i].trim())) {
      sourcesIdx = i;
      break;
    }
  }
  const out: string[] = [];
  out.push("## Findings", "");
  for (let i = firstIdx; i < lines.length; i++) {
    if (i === sourcesIdx) {
      out.push("", "## Sources", "");
    }
    out.push(lines[i]);
  }
  return out.join("\n");
}

function deterministicCitationFix(draft: string, deepUrls: string[]): string | null {
  if (deepUrls.length === 0) return null;
  // Trim trailing whitespace; remove an existing weak/empty Sources block if present.
  const cleaned = draft.replace(/\n##\s+Sources?\s*\n[\s\S]*$/i, "").trimEnd();
  const lines = ["", "## Sources", ""];
  for (const u of deepUrls.slice(0, 10)) {
    let label = u;
    try {
      const url = new URL(u);
      label = `${url.hostname}${url.pathname}`.replace(/\/$/, "");
    } catch { /* keep raw */ }
    lines.push(`- [${label}](${u})`);
  }
  return cleaned + "\n" + lines.join("\n") + "\n";
}

function repairDraft(
  draft: string,
  violations: ContractViolation[],
  ctx: ContractContext,
): { final: string; repairs: string[] } {
  if (violations.length === 0) return { final: draft, repairs: [] };

  const repairableRules = new Set(["structural", "citation", "roadmap_tagging"]);
  const actionable = violations.filter(v => repairableRules.has(v.rule));
  if (actionable.length === 0) return { final: draft, repairs: [] };

  let final = draft;
  const repairs: string[] = [];

  // Structural: prepend '## Findings' / '## Sources' so prose leads and a heading exists.
  if (actionable.some(v => v.rule === "structural")) {
    const fixed = deterministicStructuralFix(final);
    if (HEADING_RE.test(fixed) && fixed !== final) {
      final = fixed;
      repairs.push("structural: deterministic '## Findings' / '## Sources' headings prepended");
    }
  }

  // Citation: append a '## Sources' block built from crawled deep URLs.
  if (actionable.some(v => v.rule === "citation") && (ctx.crawledUrls?.length ?? 0) > 0) {
    const fixed = deterministicCitationFix(final, ctx.crawledUrls!);
    if (fixed && fixed !== final) {
      final = fixed;
      repairs.push(`citation: appended deterministic '## Sources' from ${ctx.crawledUrls!.length} crawled URLs`);
    }
  }

  // Roadmap tagging: append "(roadmap)" to any roadmap-cited sentence missing it.
  if (actionable.some(v => v.rule === "roadmap_tagging")) {
    const fixed = deterministicRoadmapFix(final);
    if (fixed !== final) {
      final = fixed;
      repairs.push(`roadmap_tagging: appended '(roadmap)' to roadmap-cited sentence(s)`);
    }
  }

  return { final, repairs };
}


// ---------------------- H. SYNC JUDGE WITH RETRY ----------------------

async function judgeWithRetry(
  content: string, ctx: ContractContext, intent: QueryIntent | null, maxAttempts = 2,
): Promise<{ scores: JudgeEvaluation | null; failureReason: string | null }> {
  let lastErr: string | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await evaluateResponse(content, ctx.competitor, ctx.subCategory, intent);
      if (result) return { scores: result, failureReason: null };
      lastErr = `Attempt ${attempt}: judge returned null`;
    } catch (e) {
      lastErr = `Attempt ${attempt}: ${e instanceof Error ? e.message : String(e)}`;
    }
    if (attempt < maxAttempts) {
      await new Promise(r => setTimeout(r, 400 * attempt)); // backoff
    }
  }
  return { scores: null, failureReason: lastErr || "judge failed without error" };
}

// ---------------------- I. ENTRY POINT ----------------------

export interface RunOptions {
  // If true, skip the deterministic repair pass (used by validate-trace where we
  // just want to score an already-persisted response without mutating it).
  scoreOnly?: boolean;
  // If true, skip the synchronous LLM-as-Judge call. The critical-path caller
  // (chat-analysis) sets this so the judge runs off-path in a background task —
  // the judge produces analytics-only scores and must never gate stream close.
  skipJudge?: boolean;
  // Pre-classified intent (skip the LLM intent classifier when caller already has it)
  preComputedIntent?: QueryIntent;
}

/** Standalone judge entry point for off-critical-path scoring (background task).
 *  Mirrors the synchronous judge that previously ran inside runResponseContract. */
export async function judgeResponse(
  content: string,
  competitor: string,
  subCategory: string,
  intent: QueryIntent | null,
): Promise<{ scores: JudgeEvaluation | null; failureReason: string | null; judgeMs: number }> {
  const start = Date.now();
  const { scores, failureReason } = await judgeWithRetry(
    content,
    { competitor, subCategory } as ContractContext,
    intent,
  );
  return { scores, failureReason, judgeMs: Date.now() - start };
}

/**
 * Unconditional pre-pass: strip markdown links with empty/whitespace-only hrefs
 * (e.g. `[Source]()`, `[Source]( )`). The model emits these placeholders when
 * it runs out of confident URLs; they render as dead links in the UI. We
 * remove them at the source so they never reach storage or render — this runs
 * even when crawledUrls is empty (gallery-only competitors).
 *
 * Inside a `## Sources` section: drop the entire line (incl. bullet/whitespace).
 * Outside that section: replace with the bare label so prose remains readable.
 */
function stripEmptyHrefSources(input: string): { text: string; stripped: number } {
  const EMPTY_HREF_RE = /\[[^\]]*\]\(\s*\)/g;
  if (!EMPTY_HREF_RE.test(input)) return { text: input, stripped: 0 };
  EMPTY_HREF_RE.lastIndex = 0;

  const lines = input.split("\n");
  let inSourcesBlock = false;
  let stripped = 0;
  const out: string[] = [];

  for (const line of lines) {
    if (/^##\s+(Sources?|Reference\s*Links?)\b/i.test(line)) {
      inSourcesBlock = true;
      out.push(line);
      continue;
    }
    if (inSourcesBlock && /^##\s+/.test(line)) {
      inSourcesBlock = false;
    }

    const empties = line.match(/\[[^\]]*\]\(\s*\)/g);
    if (!empties) {
      out.push(line);
      continue;
    }
    stripped += empties.length;

    // Remove all empty-href tokens regardless of section. We never preserve
    // the label as visible text — `Source` with no URL is the exact symptom
    // we are eliminating (renders as a bare word in Sources sections).
    const removed = line.replace(/\[[^\]]*\]\(\s*\)/g, "");
    const residue = removed.replace(/^[\s\-*•|]+/, "").replace(/[\s,;|]+$/, "").trim();

    if (residue.length === 0) {
      // Line was only empty citation placeholders — drop entirely.
      continue;
    }
    // Mixed line (e.g. table cell, prose with one bad citation): keep cleaned remainder.
    out.push(removed.replace(/[ \t]{2,}/g, " ").replace(/\s+([.,;:!?])/g, "$1").trimEnd());
  }

  // Collapse leftover blank lines and drop empty `## Sources` sections.
  let cleaned = out.join("\n").replace(/\n{3,}/g, "\n\n");
  cleaned = cleaned.replace(
    /(##\s+(?:Sources?|Reference\s*Links?)\s*)\n+(?=##\s|$)/gi,
    "",
  );
  return { text: cleaned, stripped };
}

export async function runResponseContract(
  draft: string,
  userPrompt: string,
  ctx: ContractContext,
  opts: RunOptions = {},
): Promise<ContractResult> {
  const intent = opts.preComputedIntent ?? await classifyQueryIntent(userPrompt);

  // Pre-pass: unconditionally strip empty-href markdown links so they can
  // never escape to the rendered response, regardless of repair availability.
  const preStrip = stripEmptyHrefSources(draft);
  const workingDraft = preStrip.text;
  const violations = detectViolations(workingDraft, intent, ctx);

  const blocking = violations.filter(v => v.severity === "block");
  // Only structural + citation + roadmap_tagging are deterministically repairable
  // now that the LLM repair path is removed. Others are recorded but not rewritten.
  const repairableRules = new Set(["structural", "citation", "roadmap_tagging"]);
  const hasRepairable = violations.some(v => repairableRules.has(v.rule));

  let final = workingDraft;
  let repairs: string[] = [];
  const repairLog: RepairLogEntry[] = [];
  let verdict: ContractResult["verdict"] = "pass";
  let repairMs = 0;
  let judgeMs = 0;

  // If the empty-href pre-pass actually changed the draft, log it as a repair
  // so observability surfaces the cleanup. Promote the verdict so the trace
  // is not silently marked "pass" after a structural cleanup.
  if (preStrip.stripped > 0) {
    repairs.push(`citation: stripped ${preStrip.stripped} empty-href Source entries (deterministic pre-pass)`);
    verdict = "repaired_deterministic";
    repairLog.push({
      rule: "citation",
      before_excerpt: draft.slice(0, 400),
      after_excerpt: workingDraft.slice(0, 400),
    });
  }

  // Deterministic repair: synchronous and instant. Runs when there are
  // structural/citation violations. No external LLM, so it never gates stream
  // close. Violations that are not deterministically repairable flow through to
  // the `failed` verdict below when they are blocking.
  if (!opts.scoreOnly && hasRepairable) {
    const beforeExcerpt = workingDraft.slice(0, 400);
    const repairStart = Date.now();
    const repairOut = repairDraft(workingDraft, violations, ctx);
    repairMs = Date.now() - repairStart;

    if (repairOut.final !== workingDraft && repairOut.repairs.length > 0) {
      final = repairOut.final;
      repairs = [...repairs, ...repairOut.repairs];
      // Re-run violation detection on the repaired text
      const postViolations = detectViolations(final, intent, ctx);
      const stillBlocking = postViolations.filter(v => v.severity === "block");
      verdict = stillBlocking.length === 0 ? "repaired_deterministic" : "failed";
      // Log structured before/after for each rule that was targeted
      const ruleSet = new Set(violations.filter(v => repairableRules.has(v.rule)).map(v => v.rule));
      for (const rule of ruleSet) {
        repairLog.push({
          rule,
          before_excerpt: beforeExcerpt,
          after_excerpt: final.slice(0, 400),
        });
      }
    } else if (blocking.length > 0) {
      // Repair produced no usable change — mark failed but still persist draft
      verdict = "failed";
      repairLog.push({
        rule: blocking.map(b => b.rule).join(","),
        before_excerpt: beforeExcerpt,
        after_excerpt: "[no deterministic repair available]",
      });
    }
  } else if (blocking.length > 0) {
    verdict = "failed";
  }

  // Post-pass: re-run the empty-href stripper on the final text. The deterministic
  // citation fix can synthesize a Sources block from crawled URLs; this guarantees
  // the persisted output never contains empty citations regardless of path.
  const postStrip = stripEmptyHrefSources(final);
  if (postStrip.stripped > 0) {
    final = postStrip.text;
    repairs.push(`citation: stripped ${postStrip.stripped} empty-href Source entries (post-repair pass)`);
  }

  // Judge is analytics-only — it cannot change visible content. Critical-path
  // callers pass skipJudge:true and run judgeResponse() in a background task so
  // the LLM judge never gates stream close. validate-trace / scoreOnly still
  // judge inline because scoring is the whole point of that path.
  let scores: JudgeEvaluation | null = null;
  let failureReason: string | null = opts.skipJudge ? "judge_deferred_to_background" : null;
  if (!opts.skipJudge) {
    const judgeStart = Date.now();
    const judged = await judgeWithRetry(final, ctx, intent);
    judgeMs = Date.now() - judgeStart;
    scores = judged.scores;
    failureReason = judged.failureReason;
  }

  return {
    final,
    intent,
    violations,
    repairs,
    repairLog,
    scores,
    judgeFailureReason: failureReason,
    verdict,
    repairMs,
    judgeMs,
  };
}
