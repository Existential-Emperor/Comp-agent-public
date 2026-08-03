// Media crawl, gallery, and quality helpers — extracted from chat-analysis for bundle size optimization

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getProductAreaDescription } from "./product-areas.ts";
import { firecrawlFetch, hasFirecrawlKey } from "./firecrawl-keys.ts";

// ===== Shared video gate ledger =====
//
// A single admit/reject ledger for YouTube videos, consulted and updated by BOTH
// the fast phase (searchYouTubeVideos) and the slow phase (filterMediaWithQualityAgent).
// Keyed "<competitor.toLowerCase()>::<videoId>". Each video is gated at most once
// per warm isolate. `expiresAt: null` = permanent (real gate verdict);
// a numeric `expiresAt` = TTL-bound exclusion (gate failure/timeout) so transient
// outages don't trigger repeated 15s timeouts on the same videos.
interface VideoGateEntry {
  verdict: boolean;
  expiresAt: number | null;
}
const videoGateCache = new Map<string, VideoGateEntry>();

function videoCacheKey(competitor: string, videoId: string): string {
  return `${competitor.toLowerCase()}::${videoId}`;
}

function isCacheEntryFresh(entry: VideoGateEntry | undefined): entry is VideoGateEntry {
  return !!entry && (entry.expiresAt === null || entry.expiresAt > Date.now());
}

function extractYouTubeId(url: string): string | null {
  const m = (url || "").match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}

// ===== Semantic relevance =====

export function buildSemanticSearchTerms(category: string, subCategory: string): string[] {
  const desc = getProductAreaDescription(category, subCategory);
  if (!desc) return [subCategory.toLowerCase()];

  const terms: string[] = [];
  terms.push(subCategory.toLowerCase());

  const technicalPatterns = [
    /\b(?:add-(?:in|on)|plug-?in|integration|connector|extension)\b/gi,
    /\b(?:Google Sheets|Excel|PowerPoint|Word)\b/gi,
    /\b(?:dashboard|visualization|report(?:ing)?|forecast(?:ing)?|anomaly|drill[- ](?:through|down))\b/gi,
    /\b(?:matrix|hypercube|cube sheet|modeled sheet|standard sheet)\b/gi,
    /\b(?:workflow|approval|audit trail|cell note|process tracker)\b/gi,
    /\b(?:workforce|headcount|HCM|sales planning|territory|quota|consolidation)\b/gi,
    /\b(?:machine learning|ML|ARIMA|predictive|AI)\b/gi,
    /\b(?:ETL|data source|loader|import|data integration)\b/gi,
    /\b(?:ad[- ]hoc|Cell Explorer|OfficeConnect)\b/gi,
    /\b(?:intercompany|currency translation|elimination|financial close)\b/gi,
    /\b(?:natural language|conversational|variance analysis)\b/gi,
    /\b(?:spreadsheet|write-?back|refresh)\b/gi,
  ];

  for (const pattern of technicalPatterns) {
    const matches = desc.matchAll(pattern);
    for (const m of matches) {
      const term = m[0].toLowerCase().trim();
      if (term.length > 2 && !terms.includes(term)) terms.push(term);
    }
  }

  return terms;
}

export function isPageSemanticlyRelevant(
  page: { title?: string; page_url?: string; content_summary?: string },
  category: string,
  subCategory: string
): boolean {
  const isFullProduct = category === "Full Product" && subCategory === "Full Product";
  if (isFullProduct) return true;

  const searchTerms = buildSemanticSearchTerms(category, subCategory);
  if (searchTerms.length === 0) return true;

  const haystack = [
    page.title || "",
    page.page_url || "",
    (page.content_summary || "").slice(0, 1000),
  ].join(" ").toLowerCase();

  return searchTerms.some(term => haystack.includes(term));
}

export function buildSearchQueries(competitor: string, category: string, subCategory: string): string[] {
  const desc = getProductAreaDescription(category, subCategory);
  const queries: string[] = [];

  if (desc) {
    const firstSentence = desc.split(".")[0];
    queries.push(`${competitor} ${firstSentence.slice(0, 80)}`);
  }

  const searchTerms = buildSemanticSearchTerms(category, subCategory);
  const topTerms = searchTerms.slice(0, 4).join(" ");
  queries.push(`${competitor} ${topTerms} features`);
  queries.push(`${competitor} ${subCategory} product documentation`);

  return queries;
}

// ===== Competitor classification =====

const VIDEO_ONLY_COMPETITORS = new Set(["planful"]);
const GALLERY_ONLY_COMPETITORS = new Set([
  "onestream", "anaplan", "planful", "oracle", "oracleepm", "oracleepmcloud",
  "oraclepbcs", "oraclefccs", "sap", "sapanalyticscloud", "sapbpc", "pigment",
]);

export function isGalleryOnlyCompetitor(competitor: string): boolean {
  const token = competitor.toLowerCase().replace(/[^a-z0-9]/g, "");
  return GALLERY_ONLY_COMPETITORS.has(token);
}

export function isVideoOnlyCompetitor(competitor: string): boolean {
  return VIDEO_ONLY_COMPETITORS.has(competitor.toLowerCase().replace(/[^a-z0-9]/g, ""));
}

export function getCompetitorNameVariants(competitor: string): string[] {
  const variants = [competitor];
  const token = competitor.toLowerCase().replace(/[^a-z0-9]/g, "");

  const KNOWN_EXPANSIONS: Record<string, string[]> = {
    oracle: ["Oracle EPM Cloud", "Oracle Fusion Cloud EPM", "Oracle Hyperion Planning", "Oracle Essbase"],
    sap: ["SAP Analytics Cloud", "SAP BPC", "SAP Group Reporting"],
    ibm: ["IBM Planning Analytics", "IBM Cognos TM1"],
    workday: ["Workday Adaptive Planning"],
    onestream: ["OneStream XF", "OneStream Software"],
    planful: ["Planful"],
    anaplan: ["Anaplan"],
    pigment: ["Pigment"],
    vena: ["Vena Solutions", "Vena"],
    board: ["Board International", "Board"],
    prophix: ["Prophix"],
    jedox: ["Jedox"],
  };

  const expansions = KNOWN_EXPANSIONS[token];
  if (expansions) {
    for (const exp of expansions) {
      if (!variants.includes(exp)) variants.push(exp);
    }
  }

  return variants;
}

// ===== URL/image helpers =====

function sanitizeSlug(value: string, fallback = "item"): string {
  const slug = value.toLowerCase().replace(/https?:\/\//g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
  return slug || fallback;
}

function extractHostname(url: string): string | null {
  try { return new URL(url).hostname.toLowerCase(); } catch { return null; }
}

function extFromContentType(contentType: string | null): string {
  if (!contentType) return "png";
  if (contentType.includes("image/jpeg")) return "jpg";
  if (contentType.includes("image/webp")) return "webp";
  if (contentType.includes("image/gif")) return "gif";
  if (contentType.includes("image/png")) return "png";
  return "png";
}

function isAllowedDomain(hostname: string | null, allowedDomains: Set<string>): boolean {
  if (!hostname) return false;
  for (const allowed of allowedDomains) {
    if (hostname === allowed || hostname.endsWith(`.${allowed}`)) return true;
  }
  return false;
}

export function isLikelyProductUiImage(url: string, altText = ""): boolean {
  const lower = url.toLowerCase();
  const alt = altText.toLowerCase();

  if (/(?:youtube\.com|youtu\.be|ytimg\.com|ggpht\.com|vimeocdn\.com|wistia\.(?:com|net)|vidyard\.com|loom\.com)/i.test(lower)) return false;
  if (/\.(svg)(\?|$)/i.test(lower)) return false;
  if (/\b(icon|favicon|avatar|badge|logo|pixel|sprite|banner|hero|thumbnail|thumb|social|sharing|og-image|twitter|facebook|linkedin)\b/.test(lower)) return false;
  if (/\b(blog|news|press|careers|about|contact|team|partner|customer-logo|testimonial)\b/.test(lower)) return false;
  if (/\b(spacer|divider|arrow|bullet|check|star|rating|gradient|background|bg-|pattern)\b/.test(lower)) return false;
  if (/[_-](\d{1,2})x(\d{1,2})\b/.test(lower)) return false;

  const productAltSignals = /\b(screenshot|screen shot|dashboard|interface|dialog|modal|wizard|configuration|settings|panel|form|report|chart|graph|workflow|module|view|editor|builder|designer|canvas|grid|table|workspace)\b/i;
  const hasProductAlt = productAltSignals.test(alt);

  const isImageFile = /\.(png|jpe?g|gif|webp)(\?|$)/i.test(lower) || lower.includes("/images/") || lower.includes("/media/");
  if (!isImageFile) return false;
  if (hasProductAlt) return true;
  if (/\/(header|footer|nav|sidebar|cta|promo|offer|campaign|marquee)\//i.test(lower)) return false;

  return true;
}

export function isHighValueCachedScreenshot(screenshotUrl: string): boolean {
  const lower = screenshotUrl.toLowerCase();

  if (!lower.includes("competitor-screenshots") && /^https?:\/\//.test(lower)) return true;
  if (/\/ambient-/.test(lower)) return false;
  if (/storage\.googleapis\.com\/firecrawl-scrape-media\/screenshot-/i.test(lower)) return false;
  if (/\/inline-/.test(lower)) {
    if (/inline-\d+-www-/.test(lower) && !/inline-\d+-(docs|help|kb|support|community)-/.test(lower)) return false;
    return true;
  }
  if (/\/live-/.test(lower) && !/\/live-.*inline/i.test(lower)) return false;

  return true;
}

const KNOWN_DOC_CDN_DOMAINS = [
  "cdn.document360.io", "d2slcw3kip6qmk.cloudfront.net", "images.ctfassets.net",
  "cdn.sanity.io", "res.cloudinary.com", "cdn.prod.website-files.com",
];

async function getAllowedCompetitorDomains(
  supaClient: any,
  competitor: string,
): Promise<Set<string>> {
  const domains = new Set<string>();
  for (const cdn of KNOWN_DOC_CDN_DOMAINS) domains.add(cdn);

  const { data: compRows } = await supaClient
    .from("competitors").select("website").eq("name", competitor).limit(1);

  const website = compRows?.[0]?.website as string | undefined;
  if (website && typeof website === "string") {
    const host = extractHostname(website.startsWith("http") ? website : `https://${website}`);
    if (host) domains.add(host);
  }

  const competitorToken = competitor.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (competitorToken) {
    for (const prefix of ["", "kb.", "docs.", "help.", "support.", "community."]) {
      domains.add(`${prefix}${competitorToken}.com`);
    }
  }

  const baseName = competitor.toLowerCase().replace(/^(go|try|get|use|app)/, "").replace(/[^a-z0-9]/g, "");
  if (baseName && baseName !== competitorToken) {
    domains.add(`${baseName}.com`);
    domains.add(`kb.${baseName}.com`);
    domains.add(`docs.${baseName}.com`);
    domains.add(`community.go${baseName}.com`);
  }

  const nameVariants = getCompetitorNameVariants(competitor);
  for (const variant of nameVariants) {
    const { data: pageRows } = await supaClient
      .from("competitor_pages").select("page_url").eq("competitor_name", variant).limit(100);
    for (const row of (pageRows || []) as any[]) {
      const host = extractHostname((row.page_url as string) || "");
      if (host) domains.add(host);
    }
  }

  return domains;
}

async function getBlockedCompetitorTokens(
  supaClient: any,
  competitor: string,
): Promise<string[]> {
  const { data } = await supaClient
    .from("competitors").select("name").neq("name", competitor).limit(200);
  return ((data || []) as any[])
    .map((r) => ((r.name as string) || "").toLowerCase().replace(/[^a-z0-9]/g, ""))
    .filter((t: string) => t.length >= 4);
}

async function persistImageToPermanentStorage(
  supaClient: any,
  supabaseUrl: string,
  competitor: string,
  sourcePageUrl: string,
  imageRef: string,
  index: number,
): Promise<string | null> {
  try {
    const competitorSlug = sanitizeSlug(competitor, "competitor");
    const pageSlug = sanitizeSlug(sourcePageUrl || "live-crawl", "live-crawl");

    const imgRes = await fetch(imageRef, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; chat-analysis-live-crawler/1.0)" },
    });
    if (!imgRes.ok) return null;

    const fetchedType = (imgRes.headers.get("content-type") || "").split(";")[0].toLowerCase();
    if (!fetchedType.startsWith("image/") || fetchedType === "image/svg+xml") return null;

    const bytes = new Uint8Array(await imgRes.arrayBuffer());
    if (bytes.length < 15000) {
      console.log(`Rejected image (too small: ${bytes.length} bytes): ${imageRef.slice(0, 100)}`);
      return null;
    }

    const ext = extFromContentType(fetchedType);
    const filePath = `${competitorSlug}/live-${pageSlug}-${Date.now()}-${index}.${ext}`;

    const { data: uploadData, error: uploadErr } = await supaClient.storage
      .from("competitor-screenshots")
      .upload(filePath, bytes, { contentType: fetchedType || "image/png", upsert: true });

    if (uploadErr || !uploadData?.path) {
      console.error("Live crawl image persist failed:", uploadErr?.message || "unknown upload error");
      return null;
    }

    return `${supabaseUrl}/storage/v1/object/public/competitor-screenshots/${uploadData.path}`;
  } catch (err) {
    console.error("persistImageToPermanentStorage error:", err);
    return null;
  }
}

// ===== YouTube video search =====

export async function searchYouTubeVideos(
  competitor: string, category: string, subCategory: string
): Promise<string[]> {
  if (!hasFirecrawlKey()) return [];

  const isFullProduct = category === "Full Product" && subCategory === "Full Product";
  const ytSearchQueries = isFullProduct
    ? [
        `"${competitor}" EPM planning demo site:youtube.com`,
        `"${competitor}" financial planning software overview site:youtube.com`,
      ]
    : [
        `"${competitor}" "${subCategory}" demo site:youtube.com`,
        `"${competitor}" ${category} tutorial walkthrough site:youtube.com`,
      ];

  // 1. Collect candidates across both queries (no title filtering — that is the
  //    homograph bug, e.g. "Pigment" matching nail-polish/paint videos).
  const seenVideoIds = new Set<string>();
  const candidates: { videoId: string; url: string; label: string }[] = [];
  for (const ytQuery of ytSearchQueries) {
    try {
      console.log(`YouTube search query: ${ytQuery}`);
      const res = await firecrawlFetch("https://api.firecrawl.dev/v1/search", {
        method: "POST",
        body: JSON.stringify({ query: ytQuery, limit: 5 }),
      });
      if (!res.ok) { console.log(`YouTube search returned ${res.status} for: ${ytQuery}`); continue; }
      const data = await res.json();
      for (const result of (data.data || data.results || [])) {
        if (!result.url) continue;
        const videoId = extractYouTubeId(result.url);
        if (!videoId || seenVideoIds.has(videoId)) continue;
        seenVideoIds.add(videoId);
        candidates.push({
          videoId,
          url: `https://www.youtube.com/watch?v=${videoId}`,
          label: result.title || `${competitor} ${subCategory} video`,
        });
      }
      if (candidates.length >= 8) break;
    } catch (e) { console.error("YouTube search error:", e); }
  }

  // 2. Cache split — consult the shared video gate ledger.
  const keptApproved: { videoId: string; url: string; label: string }[] = [];
  const toGate: { videoId: string; url: string; label: string }[] = [];
  let cacheApproved = 0, cacheRejected = 0, cacheExpired = 0;
  for (const c of candidates) {
    const entry = videoGateCache.get(videoCacheKey(competitor, c.videoId));
    if (isCacheEntryFresh(entry)) {
      if (entry.verdict) { keptApproved.push(c); cacheApproved++; }
      else cacheRejected++;
    } else {
      if (entry) cacheExpired++;
      toGate.push(c);
    }
  }

  // 3. Gate the un-cached candidates through the same media-quality-agent the slow
  //    phase uses, bounded by a 15s timeout. On failure/timeout, exclude them and
  //    cache the exclusion with a 60s TTL so we don't re-timeout on every call.
  const discovered: { url: string; label: string }[] = [];
  let gateApproved = 0, gateRejectedOrExcluded = 0, gateFailed = 0, gateLatencyMs = 0;
  if (toGate.length > 0) {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const gateStart = Date.now();
    const excludeWithTtl = () => {
      gateFailed = 1;
      gateLatencyMs = Date.now() - gateStart;
      for (const c of toGate) {
        videoGateCache.set(videoCacheKey(competitor, c.videoId), { verdict: false, expiresAt: Date.now() + 60_000 });
        gateRejectedOrExcluded++;
      }
    };

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      excludeWithTtl();
    } else {
      const controller = new AbortController();
      let timer: number | undefined;
      try {
        const fetchPromise = fetch(`${SUPABASE_URL}/functions/v1/media-quality-agent`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            "apikey": SUPABASE_SERVICE_ROLE_KEY,
          },
          body: JSON.stringify({
            competitor, category, subCategory,
            mediaItems: toGate.map((c) => ({ url: c.url, label: c.label, type: "video" })),
            existingVideoIds: toGate.map((c) => c.videoId),
          }),
          signal: controller.signal,
        });
        const res = await Promise.race<Response>([
          fetchPromise,
          new Promise<Response>((_, reject) => {
            timer = setTimeout(() => {
              controller.abort();
              reject(new Error("media-quality-agent timeout after 15000ms"));
            }, 15_000) as unknown as number;
          }),
        ]);
        gateLatencyMs = Date.now() - gateStart;
        if (!res.ok) throw new Error(`media-quality-agent returned ${res.status}`);

        const result = await res.json();
        const approvedVideos = result.filteredMedia || [];
        const discoveredVideos = result.discoveredVideos || [];

        const approvedIds = new Set<string>();
        for (const m of approvedVideos) {
          const id = extractYouTubeId(m.url || "");
          if (id) approvedIds.add(id);
        }

        // Record permanent verdicts for every gated candidate.
        for (const c of toGate) {
          const verdict = approvedIds.has(c.videoId);
          videoGateCache.set(videoCacheKey(competitor, c.videoId), { verdict, expiresAt: null });
          if (verdict) { keptApproved.push(c); gateApproved++; }
          else gateRejectedOrExcluded++;
        }

        // Proactively discovered videos are pre-rated (≥7) by the agent — cache true.
        for (const v of discoveredVideos) {
          const id = extractYouTubeId(v.url || "");
          if (!id || seenVideoIds.has(id)) continue;
          seenVideoIds.add(id);
          videoGateCache.set(videoCacheKey(competitor, id), { verdict: true, expiresAt: null });
          discovered.push({ url: v.url, label: v.title || `${competitor} ${subCategory} video` });
        }
      } catch (err) {
        console.error("YouTube gate failed/timeout, excluding un-cached:", err instanceof Error ? err.message : String(err));
        excludeWithTtl();
      } finally {
        if (timer !== undefined) clearTimeout(timer);
      }
    }
  }

  // 4. Build refs in the existing format, capped at 4.
  const videoRefs: string[] = [];
  for (const c of keptApproved) {
    if (videoRefs.length >= 4) break;
    videoRefs.push(`[YouTube Search Video] ${c.label}: ${c.url}`);
  }
  for (const d of discovered) {
    if (videoRefs.length >= 4) break;
    videoRefs.push(`[YouTube Search Video] ${d.label}: ${d.url}`);
  }

  // 5. Single instrumentation log per fast-phase call.
  console.log(`[searchYouTubeVideos] ${JSON.stringify({
    competitor,
    candidates_total: candidates.length,
    cache_approved: cacheApproved,
    cache_rejected: cacheRejected,
    cache_expired: cacheExpired,
    gated: toGate.length,
    approved: gateApproved,
    rejected_or_excluded: gateRejectedOrExcluded,
    gate_failed: gateFailed,
    gate_latency_ms: gateLatencyMs,
  })}`);

  return videoRefs;
}

// ===== Live media crawling =====

export async function crawlForRelevantMedia(
  competitor: string, category: string, subCategory: string
): Promise<{ mediaRefs: string[]; newPages: string[] }> {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!hasFirecrawlKey() || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return { mediaRefs: [], newPages: [] };
  }

  const supaClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const allowedDomains = await getAllowedCompetitorDomains(supaClient, competitor);
  const blockedCompetitorTokens = await getBlockedCompetitorTokens(supaClient, competitor);
  const queries = buildSearchQueries(competitor, category, subCategory);
  const mediaRefs: string[] = [];
  const newPages: string[] = [];
  const persistedUrlSet = new Set<string>();
  const seenVideoIds = new Set<string>();

  console.log(`Live crawl for "${competitor}" / "${subCategory}" with ${queries.length} semantic queries`);
  console.log(`Allowed competitor domains: ${[...allowedDomains].join(", ")}`);

  const searchResults: { url: string; title: string; markdown?: string }[] = [];
  const seenResultUrls = new Set<string>();

  // Search with domain hints
  const searchPromises = queries.slice(0, 2).map(async (query) => {
    try {
      const domainHint = [...allowedDomains].slice(0, 2).map((d) => `site:${d}`).join(" ");
      const res = await firecrawlFetch("https://api.firecrawl.dev/v1/search", {
        method: "POST",
        body: JSON.stringify({ query: `${query} ${domainHint}`.trim(), limit: 4, scrapeOptions: { formats: ["markdown"] } }),
      });
      if (!res.ok) return;
      const data = await res.json();
      for (const result of (data.data || data.results || [])) {
        if (!result.url || seenResultUrls.has(result.url)) continue;
        const resultHost = extractHostname(result.url);
        if (!isAllowedDomain(resultHost, allowedDomains)) continue;
        const isRelevant = isPageSemanticlyRelevant(
          { title: result.title || "", page_url: result.url, content_summary: (result.markdown || result.description || "").slice(0, 1000) },
          category, subCategory,
        );
        if (!isRelevant) continue;
        seenResultUrls.add(result.url);
        searchResults.push({ url: result.url, title: result.title || result.url, markdown: result.markdown || "" });
      }
    } catch (e) { console.error("Live search error:", e); }
  });
  await Promise.all(searchPromises);

  // Fallback search without domain restriction
  if (searchResults.length === 0) {
    console.log("Strict domain search returned 0; running semantic fallback search");
    const fallbackPromises = queries.slice(0, 2).map(async (query) => {
      try {
        const res = await firecrawlFetch("https://api.firecrawl.dev/v1/search", {
          method: "POST",
          body: JSON.stringify({ query, limit: 6, scrapeOptions: { formats: ["markdown"] } }),
        });
        if (!res.ok) return;
        const data = await res.json();
        for (const result of (data.data || data.results || [])) {
          if (!result.url || seenResultUrls.has(result.url)) continue;
          const combined = `${(result.title || "").toLowerCase()} ${(result.url || "").toLowerCase()} ${((result.markdown || result.description || "") as string).toLowerCase()}`;
          if (blockedCompetitorTokens.some((token) => combined.includes(token))) continue;
          const isRelevant = isPageSemanticlyRelevant(
            { title: result.title || "", page_url: result.url, content_summary: (result.markdown || result.description || "").slice(0, 1000) },
            category, subCategory,
          );
          if (!isRelevant) continue;
          seenResultUrls.add(result.url);
          searchResults.push({ url: result.url, title: result.title || result.url, markdown: result.markdown || "" });
        }
      } catch (e) { console.error("Live search fallback error:", e); }
    });
    await Promise.all(fallbackPromises);
  }

  // Scrape pages and extract media
  const videoOnly = isVideoOnlyCompetitor(competitor);
  if (searchResults.length > 0 && !videoOnly) {
    const scrapableResults = searchResults.filter(r => {
      const isVideoPage = /(?:youtube\.com|youtu\.be|vimeo\.com|wistia\.com|vidyard\.com|loom\.com)/i.test(r.url);
      if (isVideoPage) console.log(`Skipping scrape of video platform URL: ${r.url}`);
      return !isVideoPage;
    });

    const scrapePromises = scrapableResults.slice(0, 4).map(async ({ url, title, markdown: seedMarkdown }) => {
      try {
        const res = await firecrawlFetch("https://api.firecrawl.dev/v1/scrape", {
          method: "POST",
          body: JSON.stringify({ url, formats: ["markdown", "html"], onlyMainContent: true }),
        });
        if (!res.ok) return;
        const data = await res.json();
        const scrapeData = data.data || data;
        const markdown = scrapeData.markdown || seedMarkdown || "";
        const html = scrapeData.html || "";
        const combined = `${markdown}\n${html}`;

        // Extract videos
        const videoRegexes = [
          /https?:\/\/(?:www\.)?youtube\.com\/watch\?v=([a-zA-Z0-9_-]+)/gi,
          /https?:\/\/(?:www\.)?youtube\.com\/embed\/([a-zA-Z0-9_-]+)/gi,
          /https?:\/\/youtu\.be\/([a-zA-Z0-9_-]+)/gi,
        ];
        const vimeoRegex = /https?:\/\/(?:www\.)?(?:player\.)?vimeo\.com\/(?:video\/)?(\d+)/gi;
        const wistiaRegex = /https?:\/\/[^"'\s]+\.wistia\.com\/(?:medias|embed\/iframe)\/([a-zA-Z0-9]+)/gi;
        const vidyardRegex = /https?:\/\/[^"'\s]*vidyard\.com\/(?:watch|share|embed)\/([a-zA-Z0-9]+)/gi;
        const linkVideoRegex = /<a[^>]+href=["'](https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)[^"']*?)["'][^>]*>/gi;
        const directVideoRegex = /(https?:\/\/[^\s"'<>]+\.(?:mp4|webm|mov|ogg)(?:\?[^\s"'<>]*)?)/gi;
        const videoTagRegex = /<(?:video|source)[^>]+src=["']([^"']+\.(?:mp4|webm|mov|ogg)(?:\?[^"']*)?)["'][^>]*>/gi;
        const loomRegex = /https?:\/\/(?:www\.)?loom\.com\/(?:share|embed)\/([a-zA-Z0-9]+)/gi;

        for (const re of videoRegexes) {
          let vm;
          while ((vm = re.exec(combined)) !== null) {
            if (!seenVideoIds.has(vm[1])) {
              seenVideoIds.add(vm[1]);
              mediaRefs.push(`[Live Crawl Video] ${title || competitor} - ${subCategory}: https://www.youtube.com/watch?v=${vm[1]}`);
              if (!newPages.includes(url)) newPages.push(url);
            }
          }
        }

        let vimeoMatch;
        while ((vimeoMatch = vimeoRegex.exec(combined)) !== null) {
          if (!seenVideoIds.has(`vimeo-${vimeoMatch[1]}`)) {
            seenVideoIds.add(`vimeo-${vimeoMatch[1]}`);
            mediaRefs.push(`[Live Crawl Video] ${title || competitor} - ${subCategory}: https://vimeo.com/${vimeoMatch[1]}`);
            if (!newPages.includes(url)) newPages.push(url);
          }
        }

        let wistiaMatch;
        while ((wistiaMatch = wistiaRegex.exec(combined)) !== null) {
          if (!seenVideoIds.has(`wistia-${wistiaMatch[1]}`)) {
            seenVideoIds.add(`wistia-${wistiaMatch[1]}`);
            mediaRefs.push(`[Live Crawl Video] ${title || competitor} Wistia - ${subCategory}: ${wistiaMatch[0]}`);
            if (!newPages.includes(url)) newPages.push(url);
          }
        }

        let vidyardMatch;
        while ((vidyardMatch = vidyardRegex.exec(combined)) !== null) {
          if (!seenVideoIds.has(`vidyard-${vidyardMatch[1]}`)) {
            seenVideoIds.add(`vidyard-${vidyardMatch[1]}`);
            mediaRefs.push(`[Live Crawl Video] ${title || competitor} Vidyard - ${subCategory}: ${vidyardMatch[0]}`);
            if (!newPages.includes(url)) newPages.push(url);
          }
        }

        let directMatch;
        while ((directMatch = directVideoRegex.exec(combined)) !== null) {
          const dedupeKey = `direct-${directMatch[1].replace(/\?.*$/, "")}`;
          if (!seenVideoIds.has(dedupeKey)) {
            seenVideoIds.add(dedupeKey);
            mediaRefs.push(`[Live Crawl Video] ${title || competitor} direct video - ${subCategory}: ${directMatch[1]}`);
            if (!newPages.includes(url)) newPages.push(url);
          }
        }

        let videoTagMatch;
        while ((videoTagMatch = videoTagRegex.exec(combined)) !== null) {
          let videoSrc = videoTagMatch[1];
          try { videoSrc = new URL(videoSrc, url).toString(); } catch { continue; }
          const dedupeKey = `vtag-${videoSrc.replace(/\?.*$/, "")}`;
          if (!seenVideoIds.has(dedupeKey)) {
            seenVideoIds.add(dedupeKey);
            mediaRefs.push(`[Live Crawl Video] ${title || competitor} embedded video - ${subCategory}: ${videoSrc}`);
            if (!newPages.includes(url)) newPages.push(url);
          }
        }

        let loomMatch;
        while ((loomMatch = loomRegex.exec(combined)) !== null) {
          if (!seenVideoIds.has(`loom-${loomMatch[1]}`)) {
            seenVideoIds.add(`loom-${loomMatch[1]}`);
            mediaRefs.push(`[Live Crawl Video] ${title || competitor} Loom - ${subCategory}: https://www.loom.com/share/${loomMatch[1]}`);
            if (!newPages.includes(url)) newPages.push(url);
          }
        }

        let linkMatch;
        while ((linkMatch = linkVideoRegex.exec(combined)) !== null) {
          const ytId = linkMatch[2];
          if (ytId && !seenVideoIds.has(ytId)) {
            seenVideoIds.add(ytId);
            mediaRefs.push(`[Live Crawl Video] ${title || competitor} linked video - ${subCategory}: https://www.youtube.com/watch?v=${ytId}`);
            if (!newPages.includes(url)) newPages.push(url);
          }
        }

        // GIFs
        const gifRegex = /(https?:\/\/[^\s"'<>]+\.gif(?:\?[^\s"'<>]*)?)/gi;
        let gifMatch;
        const seenGifs = new Set<string>();
        while ((gifMatch = gifRegex.exec(combined)) !== null) {
          const gifUrl = gifMatch[1];
          const normalizedGif = gifUrl.replace(/\?.*$/, "");
          if (seenGifs.has(normalizedGif)) continue;
          seenGifs.add(normalizedGif);
          if (!isLikelyProductUiImage(gifUrl, "")) continue;
          const persistedGif = await persistImageToPermanentStorage(supaClient, SUPABASE_URL, competitor, url, gifUrl, mediaRefs.length + 1);
          if (persistedGif && !persistedUrlSet.has(persistedGif)) {
            persistedUrlSet.add(persistedGif);
            mediaRefs.push(`[Live Crawl GIF] ${title || competitor} animated demo - ${subCategory}: ${persistedGif}`);
            if (!newPages.includes(url)) newPages.push(url);
          }
        }

        // Images
        const rawMarkdownMatches = [...markdown.matchAll(/!\[([^\]]*)\]\(([^)]+)\)/gi)];
        const rawHtmlMatches = [...html.matchAll(/<img[^>]+src=["']([^"']+)["'][^>]*?(?:alt=["']([^"']*)["'])?[^>]*>/gi)];
        const imageCandidates: Array<{ altText: string; imgUrl: string }> = [];
        const seenCandidateUrls = new Set<string>();

        for (const m of rawMarkdownMatches) {
          const altText = (m[1] || "").toLowerCase();
          const rawUrl = (m[2] || "").trim();
          if (!rawUrl) continue;
          let imgUrl = rawUrl;
          try { imgUrl = new URL(rawUrl, url).toString(); } catch { continue; }
          if (!/^https?:\/\//i.test(imgUrl) || seenCandidateUrls.has(imgUrl)) continue;
          seenCandidateUrls.add(imgUrl);
          imageCandidates.push({ altText, imgUrl });
        }

        for (const m of rawHtmlMatches) {
          const rawUrl = (m[1] || "").trim();
          const htmlAlt = (m[2] || "").toLowerCase();
          if (!rawUrl) continue;
          let imgUrl = rawUrl;
          try { imgUrl = new URL(rawUrl, url).toString(); } catch { continue; }
          if (!/^https?:\/\//i.test(imgUrl) || seenCandidateUrls.has(imgUrl)) continue;
          seenCandidateUrls.add(imgUrl);
          imageCandidates.push({ altText: htmlAlt, imgUrl });
        }

        if (imageCandidates.length === 0) return;
        let inlineCount = 0;

        for (const candidate of imageCandidates) {
          if (!candidate.imgUrl || !isLikelyProductUiImage(candidate.imgUrl, candidate.altText)) continue;
          const combinedCheck = `${candidate.altText} ${candidate.imgUrl.toLowerCase()} ${(title || "").toLowerCase()} ${url.toLowerCase()}`;
          if (blockedCompetitorTokens.some((token) => combinedCheck.includes(token))) continue;
          const persistedInline = await persistImageToPermanentStorage(supaClient, SUPABASE_URL, competitor, url, candidate.imgUrl, mediaRefs.length + inlineCount + 1);
          inlineCount += 1;
          if (persistedInline && !persistedUrlSet.has(persistedInline)) {
            persistedUrlSet.add(persistedInline);
            mediaRefs.push(`[Live Crawl Inline] ${title || competitor} - ${subCategory}: ${persistedInline}`);
            if (!newPages.includes(url)) newPages.push(url);
          }
          if (inlineCount >= 5) break;
        }
      } catch (e) { console.error("Live scrape error:", e); }
    });

    await Promise.all(scrapePromises);
  }

  console.log(`Live crawl found ${mediaRefs.length} media items from ${newPages.length} new pages`);
  return { mediaRefs, newPages };
}

// ===== Gallery media lookup =====

export interface GalleryMediaResult {
  galleryMedia: string[];
  galleryUrls: Set<string>;
  count: number;
  inlineCount?: number;
  fallbackCount?: number;
  subAreaCounts?: Record<string, number>;
  droppedOffTopic?: number;
}

export interface GalleryIntentScope {
  scope: "narrow" | "broad";
  entities: string[];
}

// Build cheap regex matchers from intent entities (token boundaries, case-insensitive).
function buildEntityRegexes(entities: string[]): RegExp[] {
  const out: RegExp[] = [];
  for (const ent of entities) {
    const trimmed = (ent || "").trim();
    if (trimmed.length < 2) continue;
    const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out.push(new RegExp(`\\b${escaped}\\b`, "i"));
  }
  return out;
}

export async function getGalleryMedia(
  competitor: string, category: string, subCategory: string,
  intent?: GalleryIntentScope,
): Promise<GalleryMediaResult> {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return { galleryMedia: [], galleryUrls: new Set(), count: 0 };
  }

  const supaClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const nameVariants = getCompetitorNameVariants(competitor);
  const isFullProduct = category === "Full Product" && subCategory === "Full Product";

  let query = supaClient
    .from("media_assets")
    .select("id, competitor_name, product_area, product_sub_area, storage_url, cdn_url, media_type, alt_text, source_type, metadata, page_url")
    .in("competitor_name", nameVariants)
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (!isFullProduct) {
    query = query.eq("product_area", category).eq("product_sub_area", subCategory);
  }

  const { data: assets, error } = await query.limit(50);

  if ((!assets || assets.length === 0) && !isFullProduct) {
    console.log(`Gallery lookup: 0 assets for "${competitor}" / "${subCategory}" — returning empty`);
    return { galleryMedia: [], galleryUrls: new Set(), count: 0 };
  }

  if (!assets || assets.length === 0 || error) {
    console.log(`Gallery lookup: 0 assets for "${competitor}"`);
    return { galleryMedia: [], galleryUrls: new Set(), count: 0 };
  }

  return buildGalleryResult(assets, competitor, isFullProduct, isFullProduct ? "Full Product" : subCategory, intent);
}

function buildGalleryResult(
  assets: any[], competitor: string, isFullProduct: boolean, labelContext: string,
  intent?: GalleryIntentScope,
): GalleryMediaResult {
  const inlineLines: string[] = [];
  const fallbackLines: string[] = [];
  const galleryUrls = new Set<string>();
  const subAreaCounts: Record<string, number> = {};

  // Narrow-intent strict mode: build entity matchers up front. If the user asked
  // a narrow question (e.g. "Anaplan ALM") we only surface assets whose alt-text,
  // sub-area, or page URL mentions one of those entities. Off-topic items are
  // dropped at lookup time so they never reach the LLM context.
  const narrow = intent?.scope === "narrow" && (intent?.entities?.length || 0) > 0;
  const entityRegexes = narrow ? buildEntityRegexes(intent!.entities) : [];
  let droppedOffTopic = 0;

  for (const asset of assets) {
    const storageUrl = asset.storage_url || "";
    const cdnUrl = asset.cdn_url || "";
    const isPermanentStorage = storageUrl.includes("supabase.co/storage/");
    const url = isPermanentStorage ? storageUrl : (cdnUrl || storageUrl);
    if (!url) continue;
    const normalizedUrl = mediaDedupeKey(url);
    if (galleryUrls.has(normalizedUrl)) continue;
    galleryUrls.add(normalizedUrl);

    const subArea = asset.product_sub_area || "Unknown";
    const altText = asset.alt_text || "";
    const pageUrl = asset.page_url || "";

    // Narrow-intent strict mode: drop assets whose alt-text / sub-area / page URL
    // do not mention any of the user's narrow entities. Prevents the "40 generic
    // screenshots when the user asked about ALM" failure at lookup time.
    if (narrow && entityRegexes.length > 0) {
      const haystack = `${altText} ${subArea} ${pageUrl}`;
      if (!entityRegexes.some((re) => re.test(haystack))) {
        droppedOffTopic++;
        continue;
      }
    }

    subAreaCounts[subArea] = (subAreaCounts[subArea] || 0) + 1;

    const isVideo = asset.media_type === "video" || /\.(?:mp4|webm|mov)(?:\?|$)/i.test(url) ||
      url.includes("youtube.com") || url.includes("youtu.be") || url.includes("vimeo.com");
    const label = altText || `${asset.competitor_name} ${asset.product_sub_area} - ${asset.media_type}`;
    const pageUrlSuffix = pageUrl ? ` (from ${pageUrl})` : "";

    // Classify: full-page fallback captures (legacy live-crawl-page-screenshot or
    // metadata.capture_type='full_page_fallback') are deprioritized. Real inline
    // product UI images are preferred — and counted separately so the override
    // logic can force a fresh inline-first crawl when ONLY fallbacks exist.
    const captureType = (asset.metadata?.capture_type ?? "").toString();
    const sourceType = (asset.source_type ?? "").toString();
    const isFallback =
      captureType === "full_page_fallback" ||
      sourceType === "live-crawl-page-screenshot" ||
      /^\s*\[(Full-Page Capture|Page Screenshot)/i.test(altText);

    const line = isVideo
      ? `[Gallery Video] ${label}${pageUrlSuffix}: ${url}`
      : isFallback
        ? `[Gallery Image - Full-Page Fallback] ${label}${pageUrlSuffix}: ${url}`
        : `[Gallery Image] ${label}${pageUrlSuffix}: ${url}`;

    if (isFallback) fallbackLines.push(line);
    else inlineLines.push(line);
  }

  // Inline-first ordering so the LLM cites real product UI ahead of any
  // legacy first-fold fallback captures.
  const galleryMedia = [...inlineLines, ...fallbackLines];

  if (narrow && droppedOffTopic > 0) {
    console.log(`Gallery lookup (narrow intent): dropped ${droppedOffTopic} off-topic assets for "${competitor}" / entities=[${intent!.entities.join(", ")}]`);
  }
  console.log(`Gallery lookup: ${galleryMedia.length} active assets for "${competitor}" / "${labelContext}" (inline=${inlineLines.length}, fallback=${fallbackLines.length})`);
  return {
    galleryMedia,
    galleryUrls,
    count: galleryMedia.length,
    inlineCount: inlineLines.length,
    fallbackCount: fallbackLines.length,
    subAreaCounts,
    droppedOffTopic,
  };
}

// ===== Gallery-only override + targeted live crawl (narrow-intent fallback) =====

// Decide whether to override the gallery-only default for a competitor and run
// a live crawl. Triggered when: intent is narrow, user asked for media OR named
// entities, AND the gallery returned zero matches for the requested entity.
export function shouldOverrideGalleryOnly(
  intent: { scope: "narrow" | "broad"; entities: string[]; asksMedia: boolean },
  galleryHits: number,
  inlineGalleryHits?: number,
): boolean {
  if (intent.scope !== "narrow") return false;
  if (!intent.asksMedia && intent.entities.length === 0) return false;
  // Prefer the inline count when provided: if every gallery hit is a
  // full-page fallback (no real inline product UI), treat it as a miss
  // and force a fresh inline-first targeted crawl.
  const effectiveHits = typeof inlineGalleryHits === "number" ? inlineGalleryHits : galleryHits;
  if (effectiveHits > 0) return false;
  return true;
}

// Targeted live crawl for a narrow-intent gallery miss. Builds entity-scoped
// search queries (e.g. `"Anaplan ALM" screenshot`, `site:anaplan.com ALM`,
// `site:community.anaplan.com ALM`), scrapes top results, runs images through
// the existing media-quality-agent gate, and persists passing assets to the
// gallery so future queries hit the gallery directly.
//
// PRIVACY: only competitor + entities + public web are sent to Firecrawl/Tavily.
// No Adaptive Planning training-guide content leaves the system.
export async function runTargetedLiveCrawl(
  competitor: string,
  entities: string[],
  category: string,
  subCategory: string,
): Promise<{
  mediaRefs: string[];
  newPages: string[];
  queriesUsed: string[];
  intelligenceSnippets: string[];
  pageScreenshotsCount: number;
}> {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!hasFirecrawlKey() || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || entities.length === 0) {
    return { mediaRefs: [], newPages: [], queriesUsed: [], intelligenceSnippets: [], pageScreenshotsCount: 0 };
  }

  const supaClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const allowedDomains = await getAllowedCompetitorDomains(supaClient, competitor);
  const competitorToken = competitor.toLowerCase().replace(/[^a-z0-9]/g, "");

  // Build entity-scoped queries — entities first so search engines weight them.
  const entityList = entities.slice(0, 3);
  const queries: string[] = [];
  for (const ent of entityList) {
    queries.push(`"${competitor}" "${ent}" screenshot`);
    queries.push(`site:${competitorToken}.com ${ent}`);
    queries.push(`site:community.${competitorToken}.com ${ent}`);
    queries.push(`site:docs.${competitorToken}.com ${ent}`);
  }

  console.log(`Targeted live crawl: "${competitor}" entities=[${entities.join(", ")}] (${queries.length} queries)`);

  const mediaRefs: string[] = [];
  const newPages: string[] = [];
  const intelligenceSnippets: string[] = [];
  const persistedUrlSet = new Set<string>();
  const seenResultUrls = new Set<string>();
  const searchResults: { url: string; title: string }[] = [];
  let pageScreenshotsCount = 0;

  // Run top 6 queries in parallel
  const searchPromises = queries.slice(0, 6).map(async (q) => {
    try {
      const res = await firecrawlFetch("https://api.firecrawl.dev/v1/search", {
        method: "POST",
        body: JSON.stringify({ query: q, limit: 3 }),
      });
      if (!res.ok) return;
      const data = await res.json();
      for (const r of (data.data || data.results || [])) {
        if (!r.url || seenResultUrls.has(r.url)) continue;
        seenResultUrls.add(r.url);
        searchResults.push({ url: r.url, title: r.title || r.url });
      }
    } catch (e) { console.error("Targeted crawl search error:", e); }
  });
  await Promise.all(searchPromises);

  // Scrape top 3 result pages for text intelligence, then use the same inline-first
  // media extraction pipeline as bulk-media-crawl via screenshot-worker.
  const entityRegexes = buildEntityRegexes(entities);
  const scrapePromises = searchResults.slice(0, 3).map(async ({ url, title }) => {
    try {
      const res = await firecrawlFetch("https://api.firecrawl.dev/v1/scrape", {
        method: "POST",
        body: JSON.stringify({
          url,
          formats: ["markdown", "html", "links"],
          onlyMainContent: true,
          waitFor: 2000,
        }),
      });
      if (!res.ok) return;
      const data = await res.json();
      const scrapeData = data.data || data;
      const markdown = scrapeData.markdown || "";
      const pageTitle = (scrapeData.metadata?.title || title || url).toString().slice(0, 200);

      if (markdown && entityRegexes.length > 0) {
        const paragraphs = markdown
          .split(/\n{2,}/)
          .map((p: string) => p.replace(/\s+/g, " ").trim())
          .filter((p: string) => p.length >= 60 && p.length <= 800)
          .filter((p: string) => entityRegexes.some((re) => re.test(p)));
        if (paragraphs.length > 0) {
          const top = paragraphs.slice(0, 6);
          let snippet = `[Source: ${url}] ${pageTitle}\n${top.join("\n\n")}`;
          if (snippet.length > 1500) snippet = snippet.slice(0, 1500) + "…";
          intelligenceSnippets.push(snippet);
        }
      }

      const workerRes = await fetch(`${SUPABASE_URL}/functions/v1/screenshot-worker`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
          "apikey": SUPABASE_SERVICE_ROLE_KEY,
        },
        body: JSON.stringify({
          page_url: url,
          competitor_name: competitor,
          category,
          sub_category: subCategory,
        }),
      });

      if (!workerRes.ok) {
        const errText = await workerRes.text();
        console.error(`Targeted crawl screenshot-worker failed for ${url}: ${workerRes.status} ${errText.slice(0, 200)}`);
        return;
      }

      const workerData = await workerRes.json();
      const sourceMode = workerData.source_mode || "none";
      // Prefer the explicit `approved_assets` contract; fall back to the legacy
      // `screenshot_urls` array for backwards compat with older worker deploys.
      const approvedAssets: Array<{ url: string; capture_type: "inline" | "fallback" }> =
        Array.isArray(workerData.approved_assets) && workerData.approved_assets.length > 0
          ? workerData.approved_assets
          : (workerData.screenshot_urls || []).map((u: string) => ({
              url: u,
              capture_type: sourceMode === "inline_images_first" ? "inline" : "fallback",
            }));

      for (const asset of approvedAssets) {
        const approvedUrl = asset?.url;
        if (!approvedUrl || persistedUrlSet.has(approvedUrl)) continue;
        persistedUrlSet.add(approvedUrl);

        const isInline = asset.capture_type === "inline";
        mediaRefs.push(
          isInline
            ? `[Targeted Live Crawl] ${pageTitle} - ${entities.join("/")} (from ${url}): ${approvedUrl}`
            : `[Full-Page Capture (fallback)] ${pageTitle} - ${entities.join("/")} (from ${url}): ${approvedUrl}`,
        );
        if (!newPages.includes(url)) newPages.push(url);
        if (!isInline) pageScreenshotsCount++;
      }

      console.log(`Targeted crawl media via screenshot-worker for ${url}: ${approvedAssets.length} items (${sourceMode})`);
    } catch (e) { console.error("Targeted crawl scrape error:", e); }
  });
  await Promise.all(scrapePromises);

  console.log(`Targeted live crawl: ${mediaRefs.length} entity-matched media items (${pageScreenshotsCount} page screenshots) from ${newPages.length} pages`);

  // Persist new media to gallery so future queries hit cache.
  // Pass entities so persist can auto-deactivate stale full_page_fallback rows
  // for the same competitor + entity once a fresh inline asset lands.
  if (mediaRefs.length > 0) {
    try {
      await persistNewMediaToGallery(competitor, category, subCategory, mediaRefs, entities);
    } catch (e) { console.error("Targeted crawl persist error:", e); }
  }

  // Cap intelligence snippets to top 3 pages
  const cappedSnippets = intelligenceSnippets.slice(0, 3);
  console.log(`Targeted live crawl: ${mediaRefs.length} media + ${cappedSnippets.length} intel snippets from ${newPages.length} pages`);

  return {
    mediaRefs,
    newPages,
    queriesUsed: queries.slice(0, 6),
    intelligenceSnippets: cappedSnippets,
    pageScreenshotsCount,
  };
}

// ===== Full Product media threshold =====

export async function handleFullProductMediaThreshold(
  competitor: string, galleryResult: GalleryMediaResult,
): Promise<{ skipCrawl: boolean; missingSubAreas: string[] }> {
  const totalCount = galleryResult.count;

  const ALL_SUB_AREAS = [
    "Web-Based Matrix Reporting", "OfficeConnect", "Workday for Google Sheets",
    "Dashboards & Visualization", "Ad-Hoc Analysis",
    "Elastic Hypercube Technology", "Standard Sheets", "Cube Sheets",
    "Modeled Sheets", "Dimensions & Attributes",
    "Predictive Forecaster", "Anomaly Detection", "Planning Agent",
    "Data Integration", "Drill-Through",
    "Process Tracker", "Workflow", "Cell Notes & Audit Trail",
    "Workforce Planning", "Sales Planning", "Consolidation",
  ];

  if (totalCount > 8) {
    console.log(`Full Product media threshold: ${totalCount} > 8 — skipping media crawl for "${competitor}"`);
    return { skipCrawl: true, missingSubAreas: [] };
  }

  const coveredSubAreas = new Set(Object.keys(galleryResult.subAreaCounts || {}));
  const missingSubAreas = ALL_SUB_AREAS.filter(sa => !coveredSubAreas.has(sa));

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (totalCount === 0 && SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
    fetch(`${SUPABASE_URL}/functions/v1/bulk-media-crawl`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, "apikey": SUPABASE_SERVICE_ROLE_KEY },
      body: JSON.stringify({ competitor_name: competitor }),
    }).catch(e => console.error("bulk-media-crawl trigger error:", e));
    console.log(`Triggered bulk-media-crawl for "${competitor}" (all areas)`);
    return { skipCrawl: false, missingSubAreas: ALL_SUB_AREAS };
  }

  if (missingSubAreas.length > 0 && SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
    fetch(`${SUPABASE_URL}/functions/v1/bulk-media-crawl`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, "apikey": SUPABASE_SERVICE_ROLE_KEY },
      body: JSON.stringify({ competitor_name: competitor, product_sub_areas: missingSubAreas }),
    }).catch(e => console.error("bulk-media-crawl trigger error:", e));
    console.log(`Triggered bulk-media-crawl for "${competitor}" — ${missingSubAreas.length} missing areas`);
  }

  return { skipCrawl: false, missingSubAreas };
}

// ===== Media quality agent integration =====

export interface ParsedMediaItem {
  url: string;
  label: string;
  type: "image" | "video" | "gif";
  originalLine: string;
  /** Deep source/article page the asset was captured from, parsed from the
   *  `(from <url>)` marker. Lets the client lightbox link back to the source. */
  pageUrl?: string;
}

// Trusted-source tags: assets produced by screenshot-worker (already
// byte-classified + semantic-gated KEEP + uploaded to our bucket). The
// asset URL is the FINAL https?:// in the line, not the first.
const TRUSTED_SOURCE_TAGS = [
  "[Targeted Live Crawl]",
  "[Full-Page Capture (fallback)]",
  "[Inline Image]",
  "[Page Screenshot]",
];

function extractAssetUrl(line: string): string | null {
  // Trusted lines follow "[<TAG>] <label> (from <PAGE_URL>): <ASSET_URL>".
  // The asset URL is always after the FINAL ": http". Greedy first-match
  // grabs the (from <PAGE_URL>) page URL instead — root cause of the
  // "trusted assets silently dropped" bug.
  const lastColon = line.lastIndexOf(": http");
  if (lastColon !== -1) {
    const candidate = line.slice(lastColon + 2).trim().split(/\s+/)[0]?.replace(/[)\].,;]+$/, "");
    if (candidate && /^https?:\/\//i.test(candidate)) return candidate;
  }
  // Untrusted/legacy lines: grab the LAST URL in the line, not the first.
  const allUrls = line.match(/https?:\/\/[^\s)]+/g);
  if (allUrls && allUrls.length > 0) return allUrls[allUrls.length - 1].replace(/[)\].,;]+$/, "");
  return null;
}

/**
 * Canonical identity key for de-duplicating media URLs.
 *
 * NOTE: a naive `url.replace(/\?.*$/, "")` collapses ALL YouTube watch URLs to
 * `https://www.youtube.com/watch` because the video id lives in the query string
 * (`?v=<id>`). That silently dropped every YouTube video but the first — the
 * "only one video populates" bug. For YouTube we key on the video id; for
 * everything else we strip the query/hash (so tracking params don't create
 * duplicate images).
 */
export function mediaDedupeKey(url: string): string {
  const yt = url.match(
    /(?:youtube\.com\/(?:watch\?(?:[^#]*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([a-zA-Z0-9_-]{6,})/i,
  );
  if (yt) return `youtube:${yt[1]}`;
  return url.replace(/[?#].*$/, "");
}

export function parseMediaFromContext(mediaContext: string): ParsedMediaItem[] {
  if (!mediaContext) return [];
  const items: ParsedMediaItem[] = [];
  const seenUrls = new Set<string>();

  for (const line of mediaContext.split("\n")) {
    const url = extractAssetUrl(line);
    if (!url) continue;
    const dedupeKey = mediaDedupeKey(url);
    if (seenUrls.has(dedupeKey)) continue;
    seenUrls.add(dedupeKey);

    const isTrusted = TRUSTED_SOURCE_TAGS.some((t) => line.startsWith(t));
    const isVideo = url.includes("youtube.com/watch") || url.includes("youtu.be/") ||
      url.includes("vimeo.com/") || url.includes("wistia.com/") ||
      url.includes("vidyard.com/") || url.includes("loom.com/") ||
      /\.(?:mp4|webm|mov|ogg)(?:\?|$)/i.test(url);
    const isGif = /\.gif(?:\?|$)/i.test(url);
    // Trusted assets bypass extension sniffing — they're already validated.
    const isImage = !isVideo && (
      isTrusted ||
      /\.(?:png|jpe?g|webp)(?:\?|$)/i.test(url) ||
      url.includes("competitor-screenshots")
    );

    if (!isVideo && !isGif && !isImage) continue;

    const labelMatch = line.match(/\]\s*(.+?)(?:\s*\(|:\s*https?)/);
    const label = labelMatch ? labelMatch[1].trim() : line.replace(/https?:\/\/[^\s]+/g, "").replace(/[\[\]]/g, "").trim().slice(0, 120) || "Media item";

    const fromMatch = line.match(/\(from\s+(https?:\/\/[^)\s]+)\)/);
    const pageUrl = fromMatch ? fromMatch[1].replace(/[.,;:!?)]+$/, "") : undefined;

    items.push({ url, label, type: isVideo ? "video" : isGif ? "gif" : "image", originalLine: line, pageUrl });
  }

  return items;
}

export async function filterMediaWithQualityAgent(
  mediaContext: string, competitor: string, category: string, subCategory: string,
  intent?: { entities?: string[] } | null,
): Promise<string> {
  if (!mediaContext) return "";

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return mediaContext;

  const parsedMedia = parseMediaFromContext(mediaContext);
  if (parsedMedia.length === 0) return mediaContext;

  // Trust boundary applies to URL parsing only, NOT relevance scoring.
  // The screenshot-worker validates that an asset is a real image we own,
  // but it does NOT enforce sub-area relevance (faces, stock illustrations,
  // decorative blog headers can still slip through). All items — trusted or
  // not — must pass the media-quality-agent's relevance + score check.
  const trustedCount = parsedMedia.filter((m) => TRUSTED_SOURCE_TAGS.some((t) => m.originalLine.startsWith(t))).length;
  console.log(`Media Quality Agent: routing ALL ${parsedMedia.length} items through rater (${trustedCount} trusted-source, ${parsedMedia.length - trustedCount} untrusted)`);

  const allLines = parsedMedia.map((m) => m.originalLine);

  // Slow-phase video dedup: consult the shared ledger. Videos with a fresh
  // verdict are NOT re-rated — the fast phase (or an earlier slow phase) already
  // decided. We still send images + un-cached videos to the agent.
  const cacheApprovedUrls = new Set<string>();
  const itemsToRate: ParsedMediaItem[] = [];
  for (const item of parsedMedia) {
    if (item.type === "video") {
      const id = extractYouTubeId(item.url);
      const entry = id ? videoGateCache.get(videoCacheKey(competitor, id)) : undefined;
      if (id && isCacheEntryFresh(entry)) {
        if (entry.verdict) cacheApprovedUrls.add(mediaDedupeKey(item.url));
        continue; // cached verdict — skip the LLM call entirely
      }
    }
    itemsToRate.push(item);
  }

  const existingVideoIds: string[] = [];
  for (const item of parsedMedia) {
    if (item.type === "video") {
      const id = extractYouTubeId(item.url);
      if (id) existingVideoIds.push(id);
    }
  }

  // Helper: persist a permanent video verdict to the shared ledger.
  const recordVideoVerdict = (url: string, verdict: boolean) => {
    const id = extractYouTubeId(url);
    if (id) videoGateCache.set(videoCacheKey(competitor, id), { verdict, expiresAt: null });
  };

  // If every candidate resolved from cache, no agent call is needed.
  if (itemsToRate.length === 0) {
    const filteredLines = parsedMedia
      .filter((item) => cacheApprovedUrls.has(mediaDedupeKey(item.url)))
      .map((item) => item.originalLine);
    if (filteredLines.length === 0) return "";
    return `--- AVAILABLE OFFICIAL MEDIA (AI-verified, score ≥7 or unrated+entity-matched) ---\n${filteredLines.join("\n")}\n--- END MEDIA ---`;
  }

  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/media-quality-agent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, "apikey": SUPABASE_SERVICE_ROLE_KEY },
      body: JSON.stringify({
        competitor, category, subCategory,
        mediaItems: itemsToRate.map(m => ({ url: m.url, label: m.label, type: m.type })),
        existingVideoIds,
      }),
    });

    if (!res.ok) {
      // Last-resort fallback: pass everything through rather than dropping all assets
      // when the rater is unavailable. Better to over-include than starve the response.
      console.error(`Media Quality Agent returned ${res.status} — last-resort fallback: passing all ${parsedMedia.length} items through unrated`);
      return allLines.length > 0
        ? `--- AVAILABLE OFFICIAL MEDIA (rater unavailable — unverified) ---\n${allLines.join("\n")}\n--- END MEDIA ---`
        : mediaContext;
    }

    const result = await res.json();
    const approved = result.filteredMedia || [];
    const rejected = result.rejectedMedia || [];
    const unrated = result.unratedMedia || [];
    const discoveredVideos = result.discoveredVideos || [];

    console.log(`Media Quality Agent verdict: ${approved.length} approved, ${rejected.length} rejected, ${unrated.length} unrated, ${discoveredVideos.length} new YT videos`);

    const approvedUrls = new Set(approved.map((m: any) => mediaDedupeKey(m.url)));
    const rejectedUrls = new Set(rejected.map((m: any) => mediaDedupeKey(m.url)));

    // Write video verdicts back to the shared ledger (permanent). Unrated videos
    // (rater error) are NOT cached — they remain eligible for a later real verdict.
    for (const item of itemsToRate) {
      if (item.type !== "video") continue;
      const norm = mediaDedupeKey(item.url);
      if (approvedUrls.has(norm)) recordVideoVerdict(item.url, true);
      else if (rejectedUrls.has(norm)) recordVideoVerdict(item.url, false);
    }
    for (const v of discoveredVideos) recordVideoVerdict(v.url, true);

    // Entity-matched fallback for unrated assets
    const entities = intent?.entities ?? [];
    const entityRegexes = entities.length > 0 ? buildEntityRegexes(entities) : [];
    const allowedUnratedUrls = new Set<string>();
    if (entityRegexes.length > 0) {
      for (const m of unrated) {
        const haystack = `${m.label || ""} ${m.url || ""}`;
        if (entityRegexes.some((re) => re.test(haystack))) {
          allowedUnratedUrls.add(mediaDedupeKey(m.url || ""));
          console.log(`  ⚠️→✅ Allowing UNRATED entity-matched: ${m.label?.slice(0, 80)}`);
        }
      }
    }

    const filteredLines: string[] = [];

    for (const item of parsedMedia) {
      const norm = mediaDedupeKey(item.url);
      if (approvedUrls.has(norm) || cacheApprovedUrls.has(norm)) {
        filteredLines.push(item.originalLine);
      } else if (allowedUnratedUrls.has(norm)) {
        const tagged = item.originalLine.includes("[Unrated]")
          ? item.originalLine
          : `[Unrated] ${item.originalLine}`;
        filteredLines.push(tagged);
      }
    }

    for (const video of discoveredVideos) {
      filteredLines.push(`[Discovered Video] ${competitor} ${video.title} - ${subCategory}: ${video.url}`);
    }

    if (filteredLines.length === 0) return "";
    return `--- AVAILABLE OFFICIAL MEDIA (AI-verified, score ≥7 or unrated+entity-matched) ---\n${filteredLines.join("\n")}\n--- END MEDIA ---`;
  } catch (err) {
    console.error("Media Quality Agent call failed:", err);
    // Last-resort fallback: pass everything through unverified rather than starve the response.
    return allLines.length > 0
      ? `--- AVAILABLE OFFICIAL MEDIA (rater error — unverified) ---\n${allLines.join("\n")}\n--- END MEDIA ---`
      : mediaContext;
  }
}

// ===== Persist new media to gallery =====

export async function persistNewMediaToGallery(
  competitor: string, category: string, subCategory: string, mediaLines: string[],
  entities: string[] = [],
): Promise<void> {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return;

  const supaClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  let inserted = 0;
  let rejectedNonImage = 0;
  let insertedInlineCount = 0;

  // Lines emitted by runTargetedLiveCrawl / chat-analysis follow:
  //   "[<TAG>] <label> (from <PAGE_URL>): <ASSET_URL>"
  // The ASSET_URL is always after the FINAL ": http". The greedy first-match
  // regex previously used here grabbed the `from` page URL instead of the
  // uploaded asset URL, causing every trusted-source asset to be rejected as
  // "non-image" (root cause of trace 8096fa58).
  const TRUSTED_TAGS = [
    "[Targeted Live Crawl]",
    "[Full-Page Capture (fallback)]",
    "[Inline Image]",
    "[Page Screenshot]",
  ];

  function parseMediaLine(raw: string): { assetUrl: string; pageUrl: string | null } | null {
    const lastColon = raw.lastIndexOf(": http");
    if (lastColon === -1) return null;
    const assetUrl = raw.slice(lastColon + 2).trim().split(/\s+/)[0]?.replace(/[)\].,;]+$/, "");
    if (!assetUrl || !/^https?:\/\//i.test(assetUrl)) return null;
    const fromMatch = raw.match(/\(from\s+(https?:\/\/[^)]+)\)/i);
    return { assetUrl, pageUrl: fromMatch?.[1] ?? null };
  }

  for (const line of mediaLines) {
    const isTrustedSource = TRUSTED_TAGS.some((t) => line.startsWith(t));
    const parsed = parseMediaLine(line);

    if (!parsed) {
      if (isTrustedSource) {
        console.warn(`[persistNewMediaToGallery] WARN: trusted-source line failed parse: ${line.slice(0, 200)}`);
      }
      continue;
    }

    const url = parsed.assetUrl;

    const isVideo = url.includes("youtube.com") || url.includes("youtu.be") || url.includes("vimeo.com") ||
      url.includes("wistia.com") || url.includes("vidyard.com") || url.includes("loom.com") ||
      /\.(?:mp4|webm|mov|ogg)(?:\?|$)/i.test(url);
    if (isVideo) continue;

    // Trust boundary: assets produced by the screenshot-worker have already
    // been byte-classified, semantic-gated, and uploaded to our own bucket.
    // Only re-validate URL shape for externally-supplied (untrusted) lines.
    if (!isTrustedSource) {
      const hasImageExtension = /\.(?:png|jpe?g|gif|webp|svg|bmp|avif)(?:\?|$)/i.test(url);
      const isInSupabaseStorage = /supabase\.co\/storage\//i.test(url) ||
        url.includes("/storage/v1/object/public/competitor-screenshots/");
      if (!hasImageExtension && !isInSupabaseStorage) {
        rejectedNonImage++;
        continue;
      }
    }

    const { count } = await supaClient
      .from("media_assets")
      .select("id", { count: "exact", head: true })
      .or(`storage_url.eq.${url},cdn_url.eq.${url}`)
      .eq("competitor_name", competitor)
      .eq("is_active", true);

    if ((count || 0) > 0) continue;

    const labelMatch = line.match(/\]\s*(.+?)(?:\s*\(|:\s*https?)/);
    const altText = labelMatch ? labelMatch[1].trim().slice(0, 200) : `${competitor} ${subCategory}`;
    const mediaType = /\.gif(?:\?|$)/i.test(url) ? "gif" : "image";
    const pageUrl = parsed.pageUrl || url;
    const isFallbackCapture = line.startsWith("[Full-Page Capture (fallback)]");
    const sourceType = isFallbackCapture ? "live-crawl-page-screenshot" : "live-crawl-inline";

    const { error } = await supaClient.from("media_assets").insert({
      competitor_name: competitor,
      product_area: category,
      product_sub_area: subCategory,
      storage_url: url,
      cdn_url: url,
      media_type: isFallbackCapture ? "page_screenshot" : mediaType,
      alt_text: altText,
      source_type: sourceType,
      page_url: pageUrl,
      is_active: true,
      metadata: {
        crawl_source: "chat-analysis-auto-persist",
        persisted_at: new Date().toISOString(),
        capture_type: isFallbackCapture ? "full_page_fallback" : "inline_images_first",
        entities: entities.length > 0 ? entities : undefined,
      },
    });

    if (!error) {
      inserted++;
      if (!isFallbackCapture) insertedInlineCount++;
    } else {
      console.error(`Failed to persist media to gallery: ${error.message}`);
    }
  }

  // Loud failure mode: if every trusted line was dropped, scream in logs so
  // contract drift surfaces immediately instead of silently losing assets.
  if (mediaLines.length > 0 && inserted === 0 && rejectedNonImage === mediaLines.length) {
    console.error(
      `[persistNewMediaToGallery] ERROR: persist contract mismatch — all ${mediaLines.length} assets rejected. Sample lines: ${mediaLines.slice(0, 2).map((l) => l.slice(0, 240)).join(" || ")}`,
    );
  }

  // Auto-deactivate stale full_page_fallback rows for the same
  // competitor + product_area + entities once at least one fresh inline
  // asset has landed. This permanently retires legacy fallback captures
  // so future gallery lookups never resurface them ahead of fresh inline media.
  let deactivated = 0;
  if (insertedInlineCount > 0 && entities.length > 0) {
    const entityRegexes = buildEntityRegexes(entities);
    try {
      const { data: fallbackRows } = await supaClient
        .from("media_assets")
        .select("id, alt_text, page_url, product_sub_area, metadata")
        .eq("competitor_name", competitor)
        .eq("product_area", category)
        .eq("is_active", true)
        .or(
          "source_type.eq.live-crawl-page-screenshot," +
          "metadata->>capture_type.eq.full_page_fallback",
        );

      const idsToDeactivate: string[] = [];
      for (const row of fallbackRows || []) {
        const haystack = `${row.alt_text || ""} ${row.product_sub_area || ""} ${row.page_url || ""}`;
        if (entityRegexes.some((re) => re.test(haystack))) {
          idsToDeactivate.push(row.id);
        }
      }

      if (idsToDeactivate.length > 0) {
        const { error: deactErr } = await supaClient
          .from("media_assets")
          .update({
            is_active: false,
            updated_at: new Date().toISOString(),
            metadata: {
              deactivated_reason: "superseded_by_fresh_inline",
              deactivated_at: new Date().toISOString(),
              superseded_by_entities: entities,
            },
          })
          .in("id", idsToDeactivate);
        if (!deactErr) deactivated = idsToDeactivate.length;
        else console.error(`Failed to auto-deactivate stale fallbacks: ${deactErr.message}`);
      }
    } catch (e) {
      console.error("Auto-deactivate fallback error:", e);
    }
  }

  if (inserted > 0 || rejectedNonImage > 0 || deactivated > 0) {
    console.log(
      `persistNewMediaToGallery: inserted ${inserted} (${insertedInlineCount} inline) new assets for "${competitor}" / "${subCategory}" ` +
      `(rejected ${rejectedNonImage} non-image URLs, auto-deactivated ${deactivated} stale fallback rows for [${entities.join(", ")}])`,
    );
  }
}
