// Shared helpers for the staged news ingestion pipeline.
// All filter/classification logic lives here so discover/hydrate/finalize stay small.

import { getAllProfiles } from "./competitor-profiles.ts";

const BASE_COMPETITOR_NAMES = [
  "Anaplan", "Planful", "Vena Solutions", "Pigment", "Datarails",
  "Jedox", "Board International", "OneStream", "Prophix", "Workiva",
  "Oracle EPM", "SAP Analytics Cloud", "IBM Planning Analytics",
  "Wolters Kluwer CCH Tagetik", "Workday Adaptive Planning",
];

// Mutable export — augmented at runtime with sheet-ingested competitor names.
export const COMPETITOR_NAMES: string[] = [...BASE_COMPETITOR_NAMES];
const COMPETITOR_NAMES_LOWER = COMPETITOR_NAMES.map((c) => c.toLowerCase());

let _augmented = false;
/** Union COMPETITOR_NAMES with sheet-ingested profiles. Idempotent + cached. */
export async function ensureCompetitorNamesLoaded(): Promise<void> {
  if (_augmented) return;
  _augmented = true;
  try {
    const profiles = await getAllProfiles();
    const seen = new Set(COMPETITOR_NAMES_LOWER);
    for (const p of profiles) {
      const key = p.name.toLowerCase().trim();
      if (key && !seen.has(key)) {
        seen.add(key);
        COMPETITOR_NAMES.push(p.name);
        COMPETITOR_NAMES_LOWER.push(key);
      }
    }
    console.log(`COMPETITOR_NAMES augmented with sheet profiles: ${COMPETITOR_NAMES.length} total`);
  } catch (e) {
    console.error("ensureCompetitorNamesLoaded failed:", e);
  }
}

export const COMPETITOR_ALIASES: Record<string, string> = {
  "anaplan": "Anaplan", "planful": "Planful", "vena": "Vena Solutions",
  "pigment": "Pigment", "datarails": "Datarails", "jedox": "Jedox",
  "board international": "Board International", "onestream": "OneStream",
  "prophix": "Prophix", "workiva": "Workiva", "oracle epm": "Oracle EPM",
  "oracle planning": "Oracle EPM", "oracle cloud epm": "Oracle EPM",
  "sap analytics cloud": "SAP Analytics Cloud", "sap analytics": "SAP Analytics Cloud",
  "ibm planning analytics": "IBM Planning Analytics", "ibm planning": "IBM Planning Analytics",
  "cch tagetik": "Wolters Kluwer CCH Tagetik", "tagetik": "Wolters Kluwer CCH Tagetik",
  "adaptive planning": "Workday Adaptive Planning", "workday adaptive": "Workday Adaptive Planning",
  "workday 20": "Workday Adaptive Planning", "workday release": "Workday Adaptive Planning",
};

const SOCIAL_DOMAINS = [
  "reddit.com", "linkedin.com", "twitter.com", "x.com",
  "facebook.com", "youtube.com", "quora.com",
];

// Strong announcement-style signals only. Loose words like "product", "platform",
// "ai" were removed because they match almost every comparison/listicle article
// and let comparison spam through.
const PRODUCT_UPDATE_KEYWORDS = [
  "launch", "launches", "launched", "launching",
  "release", "released", "releases", "releasing",
  "announce", "announces", "announced", "announcement",
  "unveil", "unveils", "unveiled",
  "introduce", "introduces", "introduced",
  "rolls out", "roll out", "rolled out",
  "debut", "debuts", "debuted",
  "new feature", "new module", "new capability", "new integration",
  "partnership", "partners with", "acquires", "acquisition", "acquired",
  "funding", "raised", "raises", "series a", "series b", "series c",
  "generally available", "now available", "ga release",
  "beta", "preview", "early access",
  "pricing change", "rebrand", "rebrands", "merger", "merges with", "ipo",
  "earnings", "quarterly results", "press release",
];

const NEWS_IRRELEVANT_PATTERNS = [
  /^\d+\s*(?:best|top)\b/i,
  /\btop\s*\d+\b/i,
  /\b\d+\s*best\b/i,
  /\bbest\s.*(?:software|tools|platforms|solutions|alternatives|vendors)\b/i,
  /\bwebinar\b/i,
  /\bbuyer'?s?\s*guide\b/i,
  /\bcomplete\s*(?:guide|comparison)\b/i,
  /\balternatives?\b/i,
  /\bcompetitors?\b/i,
  /\bvs\.?\b/i,
  /\bversus\b/i,
  /\bcompare(?:d|s)?\b/i,
  /\bcomparison\b/i,
  /\bside[- ]by[- ]side\b/i,
  /\bmigration\s*guide\b/i,
  /\b(?:implementation|configuration|setup|how[- ]to|tutorial)\s*guide\b/i,
  /\bbest\s*practices\b/i,
  /\breview(?:s)?\s*(?:of|and|for)\b/i,
  /\b(?:pros|cons)\s*(?:and|of)\b/i,
  /\bhonest\s*(?:review|comparison)\b/i,
];

// URL patterns that strongly indicate listicle / comparison / vendor-shootout pages.
const NEWS_IRRELEVANT_URL_PATTERNS = [
  /\/compare\//i,
  /\/comparison/i,
  /\/vs[-_/]/i,
  /[-_]vs[-_]/i,
  /\/alternatives?(?:[-_/]|$)/i,
  /[-_]alternatives?(?:[-_/]|$)/i,
  /\/competitors?(?:[-_/]|$)/i,
  /[-_]competitors?(?:[-_/]|$)/i,
  /\/best[-_]/i,
  /\/top[-_]?\d+/i,
  /\/buyers?[-_]guide/i,
  /\/reviews?(?:[-_/]|$)/i,
];

const LISTICLE_DOMAINS = [
  "wifitalents.com", "lupahire.com", "recruiterslineup.com",
  "peoplemanagingpeople.com", "thecfoclub.com", "chatfin.ai",
  "softwarereviews.com", "infotech.com", "thefinanceweekly.com",
  "golimelight.com", "getaleph.com", "fuelfinance.me",
];

const OFFICIAL_SLUGS = [
  "anaplan", "planful", "pigment", "datarails", "jedox", "onestream", "prophix",
  "workiva", "oracle", "sap", "ibm", "board-international", "boardinternational",
  "vena-solutions", "venasolutions", "wolters-kluwer", "cch-tagetik", "workday",
  "onesoftware", "prophixsoftware", "jedoxag",
];

function hostMatches(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

export function isSocialMedia(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return SOCIAL_DOMAINS.some((d) => hostMatches(host, d));
  } catch { return false; }
}

export function isOfficialCompetitorSocial(url: string): boolean {
  try {
    const lower = url.toLowerCase();
    const u = new URL(lower);
    const host = u.hostname;
    const path = u.pathname;
    if (host.includes("linkedin.com") && path.includes("/company/")) {
      return OFFICIAL_SLUGS.some((s) => path.includes(`/company/${s}`));
    }
    if (host.includes("youtube.com") && (path.startsWith("/@") || path.startsWith("/c/") || path.startsWith("/channel/"))) {
      return OFFICIAL_SLUGS.some((s) => path.includes(s));
    }
    if (host.includes("twitter.com") || host.includes("x.com")) {
      const handle = path.split("/")[1]?.toLowerCase() || "";
      return OFFICIAL_SLUGS.some((s) => handle.includes(s));
    }
    return false;
  } catch { return false; }
}

// =============================================================================
// Identity layer — whole-word competitor matching.
//
// Substring matching (`text.includes("light")`) is fundamentally unsafe: it
// collides with English words ("highlights", "spotlight"). The principled fix
// is to compile every name/alias into a `\b…\b` regex once, and reuse it for
// both `mentionsCompetitor` and `detectCompetitorName`. No per-token allowlist.
// =============================================================================

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Compile a name into a whole-word matcher with flexible inter-token whitespace. */
function compileNameMatcher(name: string): RegExp {
  const tokens = name.trim().split(/\s+/).map(escapeRegex);
  // \b on first/last token; tokens joined by \s+ to tolerate line wraps.
  return new RegExp(`\\b${tokens.join("\\s+")}\\b`, "i");
}

let _matchersDirty = true;
let _competitorMatchers: Array<{ name: string; re: RegExp }> = [];
let _aliasMatchers: Array<{ alias: string; canonical: string; re: RegExp }> = [];

function rebuildMatchers() {
  _competitorMatchers = COMPETITOR_NAMES.map((n) => ({ name: n, re: compileNameMatcher(n) }));
  _aliasMatchers = Object.entries(COMPETITOR_ALIASES).map(([a, c]) => ({
    alias: a, canonical: c, re: compileNameMatcher(a),
  }));
  _matchersDirty = false;
}
function getMatchers() {
  if (_matchersDirty) rebuildMatchers();
  return { _competitorMatchers, _aliasMatchers };
}
// Mark dirty when COMPETITOR_NAMES is augmented at runtime.
const _origPush = COMPETITOR_NAMES.push.bind(COMPETITOR_NAMES);
(COMPETITOR_NAMES as any).push = (...args: string[]) => { _matchersDirty = true; return _origPush(...args); };

/** Returns the first competitor name (canonical) that matches as a whole word/phrase, or null. */
function findCompetitorMatch(text: string): { name: string; index: number } | null {
  const { _competitorMatchers, _aliasMatchers } = getMatchers();
  let best: { name: string; index: number } | null = null;
  for (const m of _competitorMatchers) {
    const r = m.re.exec(text);
    if (r && (best === null || r.index < best.index)) best = { name: m.name, index: r.index };
  }
  for (const m of _aliasMatchers) {
    const r = m.re.exec(text);
    if (r && (best === null || r.index < best.index)) best = { name: m.canonical, index: r.index };
  }
  return best;
}

// Brand-collision tie-breaker: only used when a single-word identity match
// (e.g. "Vena", "Pigment") co-occurs with another company's strong context.
// Whole-word matching already eliminates the "highlights → Light" class, so
// this is purely about disambiguating *real* token hits.
const BRAND_COLLISION_CONTEXTS: Array<{ name: RegExp; otherCompany: RegExp }> = [
  { name: /\bvena\b/i, otherCompany: /\bvena\s+(energy|power|renewables?|solar|wind|capital|partners?)\b/i },
  { name: /\bpigment\b/i, otherCompany: /\b(cosmetic|cosmetics|makeup|make-up|lipstick|nail\s*polish|paint|ink|dye|tattoo|skin\s*care)\b/i },
];

export function mentionsCompetitor(title: string, content?: string): boolean {
  const text = `${title} ${content || ""}`;
  const hit = findCompetitorMatch(text);
  if (!hit) return false;
  // If a multi-word canonical name (e.g. "Vena Solutions", "Board International")
  // appears, identity is unambiguous — accept.
  const { _competitorMatchers } = getMatchers();
  const hasMultiWord = _competitorMatchers.some(
    (m) => m.name.includes(" ") && m.re.test(text),
  );
  if (hasMultiWord) return true;
  // Single-word hit only — apply brand-collision tie-breaker.
  for (const c of BRAND_COLLISION_CONTEXTS) {
    if (c.name.test(text) && c.otherCompany.test(text)) return false;
  }
  return true;
}

export function detectCompetitorName(title: string, content?: string): string {
  const text = `${title} ${content || ""}`;
  const hit = findCompetitorMatch(text);
  return hit ? hit.name : "Other";
}

// =============================================================================
// Genre classifier — replaces flat keyword OR + per-genre veto regexes.
//
// Each page falls into one genre: product (substantive product/strategy news),
// financial (earnings/coverage/analyst), research (surveys/studies/reports),
// or other. Only `product` survives the gate. Product wins ties so that an
// earnings-call recap that *also* discloses a GA still classifies correctly.
// =============================================================================

const PRODUCT_GENRE_SIGNALS: RegExp[] = [
  /\b(launch|launches|launched|launching)\b/i,
  /\b(release|releases|released|releasing)\b/i,
  /\b(unveil|unveils|unveiled|unveiling)\b/i,
  /\b(introduce|introduces|introduced|introducing)\b/i,
  /\b(debut|debuts|debuted)\b/i,
  /\brolls?\s*out\b/i, /\brolled\s*out\b/i,
  /\bgenerally\s+available\b/i, /\bnow\s+available\b/i, /\bga\s+release\b/i,
  /\b(beta|preview|early\s+access)\b/i,
  /\bnew\s+(feature|module|capability|integration|version|product|release|edition)\b/i,
  /\b(acquires?|acquisition|acquired|acquiring)\b/i,
  /\b(merger|merges\s+with|merged\s+with)\b/i,
  /\b(partnership|partners\s+with|partnered\s+with|integrates?\s+with|integration\s+with)\b/i,
  /\b(rebrand|rebrands|rebranded)\b/i,
  /\bpricing\s+(change|update|model)\b/i,
  /\b(release\s+notes?|what'?s\s+new)\b/i,
  /\b(announces?|announced|announcing)\s+(?:the\s+)?(?:general\s+availability|launch|release|acquisition|partnership|integration|new)\b/i,
];

const FINANCIAL_GENRE_SIGNALS: RegExp[] = [
  /\bearnings\b/i,
  /\beps\b/i,
  /\b(beats?|misses?|tops?)\s+(estimates?|expectations?|forecasts?)\b/i,
  /\banalyst(?:'s|s')?\s+(rating|target|estimate|price\s+target|consensus)\b/i,
  /\bprice\s+target\b/i,
  /\b(stock|shares?)\s+(price|down|up|fall|drop|surge|rise|rally|tumble)\b/i,
  /\bvaluation\b/i,
  /\bdividend\b/i, /\bbuyback\b/i, /\bshare\s+repurchase\b/i,
  /\b(call\s+)?transcript\b/i,
  /\btrading\s+update\b/i,
  /\bfinancial\s+results\b/i,
  /\bquarterly\s+(results|report|update)\b/i,
  /\bannual\s+(results|report)\b/i,
  /\bfiscal\s+(year|quarter|q[1-4])\b/i,
  /\bq[1-4]\s+(20\d{2}\s+)?(results|earnings|report)\b/i,
  /\b(fy|h[12])\s+\d{2,4}\s+(results|earnings)\b/i,
  /\bguidance\b/i,
  /\b(revenue|profit|loss)\s+(grew|fell|rose|declined|increased|decreased|of\s+\$)/i,
  /\bwhat\s+to\s+(expect|watch).{0,30}\bearnings\b/i,
  /\bahead\s+of\s+earnings\b/i,
];

const RESEARCH_GENRE_SIGNALS: RegExp[] = [
  // "new study … finds/reveals/…"  (allow up to ~80 chars between)
  /\bnew\s+(study|survey|research|report)\b[^.]{0,80}?\b(finds|reveals|shows|highlights|indicates|suggests)\b/i,
  /\b(study|survey|research|report)\s+of\s+\d{2,}\s+(finance|it|executives|leaders|cfos|professionals)/i,
  /\bcommissioned\s+(study|survey|research)\b/i,
  /\bglobal\s+(survey|study)\b[^.]{0,80}?\b(finds|reveals|shows)\b/i,
  /\b\d{2,}[- ]exec(?:utive)?\s+(study|survey)\b/i,
  /\b(study|survey|research)\s+(finds|reveals|shows|highlights)\b/i,
];

export type Genre = "product" | "financial" | "research" | "other";

export function classifyGenre(title: string, content?: string): Genre {
  // Genre markers concentrate at the top of the page; cap to avoid false hits
  // from boilerplate footers / "related stories" rails.
  const head = `${title}\n${(content || "").slice(0, 1200)}`;
  if (PRODUCT_GENRE_SIGNALS.some((re) => re.test(head))) return "product";
  if (FINANCIAL_GENRE_SIGNALS.some((re) => re.test(head))) return "financial";
  if (RESEARCH_GENRE_SIGNALS.some((re) => re.test(head))) return "research";
  return "other";
}

// =============================================================================
// Substance proximity gate — a strong product signal must occur near a
// competitor mention, not just somewhere in the page.
// =============================================================================

export function isProductRelevant(title: string, content?: string): boolean {
  const text = `${title}\n${content || ""}`;
  const hit = findCompetitorMatch(text);
  if (!hit) {
    // Without an identity anchor, fall back to whole-text genre check so that
    // standalone callers (probe, post-scrape) still get a useful answer.
    return classifyGenre(title, content) === "product";
  }
  // Window of ~240 chars centered on the competitor mention.
  const start = Math.max(0, hit.index - 120);
  const end = Math.min(text.length, hit.index + 120);
  const window = text.slice(start, end);
  if (PRODUCT_GENRE_SIGNALS.some((re) => re.test(window))) return true;
  // If the title itself carries a strong product signal, accept regardless of
  // proximity (titles are short and authoritative).
  return PRODUCT_GENRE_SIGNALS.some((re) => re.test(title));
}

// Backwards-compatible thin wrappers — callers can still ask the specific
// veto questions, but the underlying logic is now a single classifier.
export function isMarketingResearchPR(title: string, content?: string): boolean {
  return classifyGenre(title, content) === "research";
}
export function isEarningsScheduling(title: string, content?: string): boolean {
  return classifyGenre(title, content) === "financial";
}

// Publication / site homepage (path is "/" or empty). Firecrawl sometimes
// returns a publisher's homepage when its banner promotes the actual story —
// the snippet looks relevant but the URL is a hub, not an article.
export function isPublicationHomepage(url: string): boolean {
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/\/+$/, "");
    if (path === "" || path === "/" || /^\/index\.(html?|php|aspx?)$/i.test(path)) return true;
  } catch {}
  return false;
}

export function isNewsRelevant(title: string, url: string): boolean {
  for (const p of NEWS_IRRELEVANT_PATTERNS) if (p.test(title)) return false;
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    if (LISTICLE_DOMAINS.some((d) => host.includes(d))) return false;
    const path = u.pathname.toLowerCase();
    for (const p of NEWS_IRRELEVANT_URL_PATTERNS) if (p.test(path)) return false;
  } catch {}
  return true;
}

// Slugs that, when they form the LAST path segment of a URL, indicate a
// listing/index hub rather than a single article. e.g. competitor.com/news,
// competitor.com/press-releases, competitor.com/blog/page/2.
const LISTING_PATH_SLUGS = [
  "news", "newsroom", "press", "press-release", "press-releases",
  "media", "media-center", "media-coverage", "in-the-news",
  "blog", "blogs", "insights", "resources", "articles",
  "release-notes", "release-calendar", "releases",
  "whats-new", "what-s-new", "announcements", "updates",
  "news-and-events", "news-events", "events",
];
const LISTING_TITLE_RE =
  /^(press\s*releases?|newsroom|release\s*(notes|calendar)|news(\s*&|\s*and)?\s*(events|announcements)?|announcements|blog|insights|what'?s\s*new|in\s*the\s*news|media\s*(center|coverage)?)\s*[-–|:]?\s*$/i;

/**
 * Heuristic: does this URL/title represent a *listing/index* page rather than
 * a single article? We check the last meaningful path segment against a known
 * slug list, with bypasses for obvious article shapes (dates, numeric ids,
 * long hyphenated slugs).
 */
export function isListingPage(url: string, title?: string): boolean {
  try {
    const u = new URL(url);
    let path = u.pathname.toLowerCase().replace(/\/+$/, "");
    // strip pagination tails: /page/2, /page/2/
    path = path.replace(/\/page\/\d+$/i, "");
    const segments = path.split("/").filter(Boolean);
    const last = segments[segments.length - 1] || "";

    // Article-shape bypass: dated paths, numeric ids, long hyphenated slugs
    const hasDateSegment = segments.some((s) => /^\d{4}([-/]\d{1,2}){0,2}$/.test(s));
    const hasNumericId = /\/(p|post|article|news)\/\d{3,}/i.test(path);
    const hyphenWords = last.split("-").filter((w) => w.length > 1).length;
    if (hasDateSegment || hasNumericId || hyphenWords >= 4) return false;

    if (last && LISTING_PATH_SLUGS.includes(last)) return true;
    // Bare hub: domain root + 1-2 segments where one matches a listing slug
    if (segments.length <= 3 && segments.some((s) => LISTING_PATH_SLUGS.includes(s))) {
      // Only treat as listing if the LAST segment isn't an article slug
      if (hyphenWords < 3) return true;
    }
  } catch {}

  if (title) {
    const t = title.trim();
    if (t.length <= 60 && LISTING_TITLE_RE.test(t)) return true;
  }
  return false;
}

/** Same registrable host? Lightweight check (suffix-aware enough for our domains). */
function sameRegistrableHost(a: string, b: string): boolean {
  const norm = (h: string) => h.replace(/^www\./, "").toLowerCase();
  const ha = norm(a), hb = norm(b);
  if (ha === hb) return true;
  // Match on last 2 labels (covers anaplan.com vs go.anaplan.com etc.)
  const tail = (h: string) => h.split(".").slice(-2).join(".");
  return tail(ha) === tail(hb);
}

/**
 * Pull candidate article URLs from a Firecrawl scrape payload of a listing page.
 * Keeps only same-domain links that look article-shaped and aren't themselves
 * listing pages. Returns up to `cap` unique URLs.
 */
export function extractArticleLinksFromFirecrawl(
  payload: any,
  baseUrl: string,
  cap = 8,
): string[] {
  const out = new Set<string>();
  let baseHost = "";
  try { baseHost = new URL(baseUrl).hostname; } catch { return []; }

  const page = payload?.data || payload || {};
  const rawLinks: string[] = Array.isArray(page.links) ? page.links : [];
  const md: string = typeof page.markdown === "string" ? page.markdown : "";

  const candidates: string[] = [...rawLinks];
  // Pull markdown links: [text](url)
  const mdLinkRe = /\]\((https?:\/\/[^\s)]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = mdLinkRe.exec(md)) !== null) candidates.push(m[1]);

  for (const raw of candidates) {
    if (!raw || typeof raw !== "string") continue;
    let abs: string;
    try { abs = new URL(raw, baseUrl).toString().split("#")[0]; } catch { continue; }
    let host = "";
    try { host = new URL(abs).hostname; } catch { continue; }
    if (!sameRegistrableHost(host, baseHost)) continue;
    if (abs === baseUrl) continue;
    if (isIrrelevantUrl(abs)) continue;
    if (isListingPage(abs)) continue;

    // Article-ish shape: long hyphenated last segment OR dated path OR /p/123 style
    try {
      const u = new URL(abs);
      const segs = u.pathname.toLowerCase().replace(/\/+$/, "").split("/").filter(Boolean);
      if (segs.length === 0) continue;
      const last = segs[segs.length - 1];
      const hyphenWords = last.split("-").filter((w) => w.length > 1).length;
      const hasDate = segs.some((s) => /^\d{4}([-/]\d{1,2}){0,2}$/.test(s));
      const hasNumericId = /\/(p|post|article|news)\/\d{3,}/i.test(u.pathname);
      if (!(hasDate || hasNumericId || hyphenWords >= 4)) continue;
    } catch { continue; }

    out.add(abs);
    if (out.size >= cap) break;
  }
  return Array.from(out);
}

export function isIrrelevantUrl(url: string): boolean {
  const lower = url.toLowerCase();
  if (lower.includes("/careers") || lower.includes("/jobs")) return true;
  if (lower.includes("remote-work-statistics")) return true;
  if (lower.includes("/about/newsroom") && !lower.includes("product")) return true;
  // Skip non-article assets
  if (/\.(pdf|zip|mp4|mp3|wav)(\?|$)/i.test(lower)) return true;
  return false;
}

export function isLikelyEnglish(title: string, content: string): boolean {
  const body = (content || "").slice(0, 500);
  const text = `${title} ${body}`;
  if (!text.trim()) return true;
  // Latin-script gate: reject when too many non-ASCII characters (CJK, Cyrillic, etc.).
  // For strongly-ASCII text in our FP&A/EPM domain, that single signal is sufficient —
  // additional stop-word heuristics caused massive false rejections of legit English
  // headlines and product pages (titles + Anthropic page snippets often lack common
  // bigrams like " the " / " and " by chance).
  const ascii = [...text].filter((c) => c.charCodeAt(0) < 128).length;
  if (ascii / text.length < 0.85) return false;
  return true;
}

// detectCompetitorName moved to identity layer above (whole-word match).

const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

export function parseDateLoose(input?: string | null): string | null {
  if (!input) return null;
  const d = new Date(input);
  if (!isNaN(d.getTime())) return d.toISOString();
  const text = input.toLowerCase();
  const my = text.match(new RegExp(`(${MONTHS.join("|")})\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(20\\d{2})`, "i"));
  if (my) {
    const idx = MONTHS.indexOf(my[1].toLowerCase());
    const day = Number(my[2]);
    const y = Number(my[3]);
    if (idx >= 0 && day >= 1 && day <= 31 && y >= 2000 && y <= 2100) {
      return new Date(Date.UTC(y, idx, day)).toISOString();
    }
  }
  const myOnly = text.match(new RegExp(`(${MONTHS.join("|")})\\s+(20\\d{2})`, "i"));
  if (myOnly) {
    const idx = MONTHS.indexOf(myOnly[1].toLowerCase());
    const y = Number(myOnly[2]);
    if (idx >= 0 && y >= 2000 && y <= 2100) {
      return new Date(Date.UTC(y, idx, 1)).toISOString();
    }
  }
  const yo = text.match(/(?:released|release|update|in)\s+(20\d{2})/i) || text.match(/\b(20\d{2})\b/);
  if (yo) {
    const y = Number(yo[1]);
    if (y >= 2000 && y <= 2100) return new Date(Date.UTC(y, 0, 1)).toISOString();
  }
  return null;
}

/** Sanity-clamp parsed dates to the realistic publication window. */
export function clampDate(iso: string | null): string | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (isNaN(t)) return null;
  const min = Date.UTC(2015, 0, 1);
  const max = Date.now() + 86400000; // tomorrow
  if (t < min || t > max) return null;
  return iso;
}

/** Walk a JSON-LD object/array tree looking for datePublished/dateCreated. */
function walkJsonLdForDate(node: any): string | null {
  if (!node) return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = walkJsonLdForDate(item);
      if (found) return found;
    }
    return null;
  }
  if (typeof node === "object") {
    const candidates = [
      node.datePublished, node.dateCreated, node.uploadDate,
      node.datePosted, node.publishedDate,
    ];
    for (const c of candidates) {
      if (typeof c === "string") {
        const parsed = parseDateLoose(c);
        if (parsed) return parsed;
      }
    }
    for (const k of Object.keys(node)) {
      const found = walkJsonLdForDate(node[k]);
      if (found) return found;
    }
  }
  return null;
}

/** Extract publication date from raw HTML using meta tags, JSON-LD, and visible body patterns. */
export function extractDateFromHtml(html: string): { date: string | null; source: string | null } {
  if (!html || typeof html !== "string") return { date: null, source: null };

  // 1. Meta-tag patterns
  const metaPatterns: Array<[RegExp, string]> = [
    [/<meta[^>]+property=["']article:published_time["'][^>]+content=["']([^"']+)["']/i, "firecrawl_html"],
    [/<meta[^>]+name=["']article:published_time["'][^>]+content=["']([^"']+)["']/i, "firecrawl_html"],
    [/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']article:published_time["']/i, "firecrawl_html"],
    [/<meta[^>]+name=["']date["'][^>]+content=["']([^"']+)["']/i, "firecrawl_html"],
    [/<meta[^>]+name=["']pubdate["'][^>]+content=["']([^"']+)["']/i, "firecrawl_html"],
    [/<meta[^>]+name=["']dc\.date\.issued["'][^>]+content=["']([^"']+)["']/i, "firecrawl_html"],
    [/<meta[^>]+itemprop=["']datePublished["'][^>]+content=["']([^"']+)["']/i, "firecrawl_html"],
    [/<time[^>]+datetime=["']([^"']+)["']/i, "firecrawl_html"],
    [/itemprop=["']datePublished["'][^>]*>([^<]+)</i, "firecrawl_html"],
  ];
  for (const [re, src] of metaPatterns) {
    const m = html.match(re);
    if (m) {
      const parsed = clampDate(parseDateLoose(m[1]));
      if (parsed) return { date: parsed, source: src };
    }
  }

  // 2. JSON-LD blocks
  const ldRe = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let ldMatch: RegExpExecArray | null;
  while ((ldMatch = ldRe.exec(html)) !== null) {
    const raw = ldMatch[1].trim();
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      const found = walkJsonLdForDate(parsed);
      const clamped = clampDate(found);
      if (clamped) return { date: clamped, source: "firecrawl_jsonld" };
    } catch {
      // Some sites wrap multiple JSON objects; try a loose extract
      const inner = raw.match(/"datePublished"\s*:\s*"([^"]+)"/i);
      if (inner) {
        const parsed = clampDate(parseDateLoose(inner[1]));
        if (parsed) return { date: parsed, source: "firecrawl_jsonld" };
      }
    }
  }

  // 3. Visible body patterns — strip tags then sweep
  const text = html.replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");

  const bodyPatterns = [
    /Published(?:\s+on)?[:\s]+([A-Za-z]+\s+\d{1,2}(?:st|nd|rd|th)?,?\s+20\d{2})/i,
    /Posted(?:\s+on)?[:\s]+([A-Za-z]+\s+\d{1,2}(?:st|nd|rd|th)?,?\s+20\d{2})/i,
    /Updated(?:\s+on)?[:\s]+([A-Za-z]+\s+\d{1,2}(?:st|nd|rd|th)?,?\s+20\d{2})/i,
    /\b([A-Za-z]+\s+\d{1,2}(?:st|nd|rd|th)?,?\s+20\d{2})\s+[—–-]\s+by\b/i,
    /\b(20\d{2}-\d{2}-\d{2})\b/,
    /\b([A-Za-z]+\s+\d{1,2}(?:st|nd|rd|th)?,?\s+20\d{2})\b/,
  ];
  for (const re of bodyPatterns) {
    const m = text.match(re);
    if (m) {
      const parsed = clampDate(parseDateLoose(m[1]));
      if (parsed) return { date: parsed, source: "firecrawl_body" };
    }
  }

  return { date: null, source: null };
}

export type QueueRow = {
  id: string;
  run_id: string;
  competitor_name: string;
  source_url: string;
  title: string | null;
  snippet: string | null;
  status: string;
  retry_count: number;
};
