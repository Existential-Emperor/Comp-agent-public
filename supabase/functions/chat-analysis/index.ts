import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getProductAreaDescription } from "../_shared/product-areas.ts";
import { retrieveKnowledge } from "../_shared/knowledge-retrieval.ts";
import { firecrawlFetch, hasFirecrawlKey } from "../_shared/firecrawl-keys.ts";
import { monitoredFetch } from "../_shared/monitored-fetch.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type SlideSectionSummary = {
  heading: string;
  bullets: string[];
  summaries: string[];
};

type SlideSummaryPayload = {
  sections: SlideSectionSummary[];
  lookup: Record<string, string>;
  generated_at: string;
  model: string;
  version: number;
};

function normalizeSlideText(value: string): string {
  return value
    .replace(/\*\*/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function buildSlideLookupKey(heading: string, bullet: string): string {
  const normalizedHeading = normalizeSlideText(heading) || "__global__";
  const normalizedBullet = normalizeSlideText(bullet);
  return `${normalizedHeading}::${normalizedBullet}`;
}

function cleanSlideBullet(text: string): string {
  return text
    .replace(/\*\*/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseContentSectionsForSlides(content: string): { heading: string; bullets: string[] }[] {
  const lines = content.split("\n");
  const sections: { heading: string; bullets: string[] }[] = [];
  let currentHeading = "Key Findings";
  let currentBullets: string[] = [];

  const flush = () => {
    if (currentBullets.length === 0) return;
    sections.push({ heading: currentHeading, bullets: currentBullets });
    currentBullets = [];
  };

  for (const rawLine of lines) {
    const headingMatch = rawLine.match(/^#{1,3}\s+(.+)/);
    if (headingMatch) {
      flush();
      currentHeading = headingMatch[1].replace(/\*\*/g, "").trim() || "Key Findings";
      continue;
    }

    const bulletMatch = rawLine.match(/^\s*[-*•]\s+(.+)/);
    if (bulletMatch) {
      const cleaned = cleanSlideBullet(bulletMatch[1]);
      if (cleaned.length > 8) currentBullets.push(cleaned);
    }
  }

  flush();
  return sections;
}

async function summarizeSlideChunk(
  LOVABLE_API_KEY: string,
  chunk: Array<{ heading: string; bullet: string }>,
  context?: string,
): Promise<string[]> {
  if (chunk.length === 0) return [];

  const numberedBullets = chunk
    .map((item, i) => `[${i + 1}] Section: ${item.heading}\nBullet: ${item.bullet}`)
    .join("\n\n");

  const systemPrompt = `You rewrite detailed analysis bullets into concise slide bullets.

Rules:
- Preserve the FULL meaning and key recommendation/finding
- Use 1-2 sentences max
- Max 280 characters per summary
- No markdown, citations, or links
- Keep original order
- Return ONLY a JSON array of strings
- Array length must be exactly ${chunk.length}`;

  const userPrompt = `${context ? `Context: ${context}\n\n` : ""}Summarize each bullet:\n\n${numberedBullets}`;

  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-5-nano",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_completion_tokens: 4096,
      }),
    });

    if (!response.ok) {
      return chunk.map((item) => cleanSlideBullet(item.bullet));
    }

    const data = await response.json();
    const rawContent = data.choices?.[0]?.message?.content || "[]";
    const jsonMatch = rawContent.match(/\[[\s\S]*\]/);

    let parsed: string[] = [];
    try {
      parsed = JSON.parse(jsonMatch?.[0] || "[]");
    } catch {
      parsed = rawContent
        .split("\n")
        .map((line: string) => line.replace(/^\d+[.)]\s*/, "").replace(/^[-*•]\s*/, "").trim())
        .filter((line: string) => line.length > 4);
    }

    while (parsed.length < chunk.length) {
      parsed.push(cleanSlideBullet(chunk[parsed.length].bullet));
    }

    return parsed.slice(0, chunk.length).map((value) => cleanSlideBullet(value));
  } catch {
    return chunk.map((item) => cleanSlideBullet(item.bullet));
  }
}

async function buildSlideSummaryPayload(
  content: string,
  context: string,
  LOVABLE_API_KEY: string,
): Promise<SlideSummaryPayload | null> {
  const parsedSections = parseContentSectionsForSlides(content);
  if (parsedSections.length === 0) return null;

  const flatItems: Array<{ heading: string; bullet: string; sectionIdx: number; bulletIdx: number }> = [];
  parsedSections.forEach((section, sectionIdx) => {
    section.bullets.forEach((bullet, bulletIdx) => {
      flatItems.push({ heading: section.heading, bullet, sectionIdx, bulletIdx });
    });
  });

  if (flatItems.length === 0) return null;

  const MAX_BULLETS = 120;
  const limitedItems = flatItems.slice(0, MAX_BULLETS);
  const chunkSize = 30;
  const chunks: Array<Array<{ heading: string; bullet: string }>> = [];
  for (let i = 0; i < limitedItems.length; i += chunkSize) {
    chunks.push(limitedItems.slice(i, i + chunkSize).map((item) => ({ heading: item.heading, bullet: item.bullet })));
  }

  const chunkSummaries = await Promise.all(
    chunks.map((chunk) => summarizeSlideChunk(LOVABLE_API_KEY, chunk, context)),
  );
  const summaryList = chunkSummaries.flat();

  const summaryByKey = new Map<string, string>();
  limitedItems.forEach((item, idx) => {
    summaryByKey.set(`${item.sectionIdx}:${item.bulletIdx}`, summaryList[idx] || cleanSlideBullet(item.bullet, 300));
  });

  const sections: SlideSectionSummary[] = parsedSections.map((section, sectionIdx) => {
    const summaries = section.bullets.map((bullet, bulletIdx) => {
      return summaryByKey.get(`${sectionIdx}:${bulletIdx}`) || cleanSlideBullet(bullet, 300);
    });
    return {
      heading: section.heading,
      bullets: section.bullets,
      summaries,
    };
  });

  const lookup: Record<string, string> = {};
  for (const section of sections) {
    for (let i = 0; i < section.bullets.length; i++) {
      const bullet = section.bullets[i];
      const summary = section.summaries[i] || cleanSlideBullet(bullet, 300);
      lookup[buildSlideLookupKey(section.heading, bullet)] = summary;
      lookup[buildSlideLookupKey("", bullet)] = summary;
    }
  }

  return {
    sections,
    lookup,
    generated_at: new Date().toISOString(),
    model: "openai/gpt-5-nano",
    version: 1,
  };
}

function queueBackgroundTask(task: Promise<unknown>) {
  try {
    const edgeRuntime = (globalThis as any)?.EdgeRuntime;
    if (edgeRuntime?.waitUntil && typeof edgeRuntime.waitUntil === "function") {
      edgeRuntime.waitUntil(task);
      return;
    }
  } catch {
    // no-op
  }
}

// ===== Semantic relevance using product area definitions =====

function buildSemanticSearchTerms(category: string, subCategory: string): string[] {
  const desc = getProductAreaDescription(category, subCategory);
  if (!desc) return [subCategory.toLowerCase()];

  // Extract key noun phrases and technical terms from the product area definition
  const terms: string[] = [];
  
  // Add the product area name itself (variations)
  terms.push(subCategory.toLowerCase());
  
  // Extract quoted/technical terms and key capability phrases from the definition
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

function isPageSemanticlyRelevant(
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

  // Require at least one semantic term match
  return searchTerms.some(term => haystack.includes(term));
}

function buildSearchQueries(competitor: string, category: string, subCategory: string): string[] {
  const desc = getProductAreaDescription(category, subCategory);
  const queries: string[] = [];

  if (desc) {
    // Extract the core capability concept from the first sentence
    const firstSentence = desc.split(".")[0];
    queries.push(`${competitor} ${firstSentence.slice(0, 80)}`);
  }

  // Build semantic queries from the definition context
  const searchTerms = buildSemanticSearchTerms(category, subCategory);
  const topTerms = searchTerms.slice(0, 4).join(" ");
  queries.push(`${competitor} ${topTerms} features`);
  queries.push(`${competitor} ${subCategory} product documentation`);

  return queries;
}

/** Competitors that lack dedicated public product pages — only use YouTube videos, skip image crawling */
const VIDEO_ONLY_COMPETITORS = new Set(["planful"]);

/** Priority competitors with pre-crawled, permanently-stored media gallery.
 *  For these, we SKIP live crawling entirely and serve media directly from media_assets. */
const GALLERY_ONLY_COMPETITORS = new Set([
  "onestream", "anaplan", "planful", "oracle", "oracleepm", "oracleepmcloud",
  "oraclepbcs", "oraclefccs", "sap", "sapanalyticscloud", "sapbpc", "pigment",
]);

function isGalleryOnlyCompetitor(competitor: string): boolean {
  const token = competitor.toLowerCase().replace(/[^a-z0-9]/g, "");
  return GALLERY_ONLY_COMPETITORS.has(token);
}

function isVideoOnlyCompetitor(competitor: string): boolean {
  return VIDEO_ONLY_COMPETITORS.has(competitor.toLowerCase().replace(/[^a-z0-9]/g, ""));
}

/** Build fuzzy name variants for competitor page lookup.
 *  e.g. "Oracle" → ["Oracle", "Oracle EPM Cloud", "Oracle Fusion Cloud EPM", ...] */
function getCompetitorNameVariants(competitor: string): string[] {
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

// ===== Live visual crawling — strict competitor-only media (no viewport screenshots) =====
function sanitizeSlug(value: string, fallback = "item"): string {
  const slug = value.toLowerCase().replace(/https?:\/\//g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
  return slug || fallback;
}

function extractHostname(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
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

function isLikelyProductUiImage(url: string, altText = ""): boolean {
  const lower = url.toLowerCase();
  const alt = altText.toLowerCase();

  // REJECT: Images hosted on video platforms (always thumbnails/logos, never product UI)
  if (/(?:youtube\.com|youtu\.be|ytimg\.com|ggpht\.com|vimeocdn\.com|wistia\.(?:com|net)|vidyard\.com|loom\.com)/i.test(lower)) return false;

  // REJECT: SVGs (almost always icons/logos)
  if (/\.(svg)(\?|$)/i.test(lower)) return false;

  // REJECT: Common non-product image patterns in URLs
  if (/\b(icon|favicon|avatar|badge|logo|pixel|sprite|banner|hero|thumbnail|thumb|social|sharing|og-image|twitter|facebook|linkedin)\b/.test(lower)) return false;
  if (/\b(blog|news|press|careers|about|contact|team|partner|customer-logo|testimonial)\b/.test(lower)) return false;

  // REJECT: Tracking pixels, spacers, decorative elements
  if (/\b(spacer|divider|arrow|bullet|check|star|rating|gradient|background|bg-|pattern)\b/.test(lower)) return false;

  // REJECT: Very small images (1x1, 2x2, etc.) indicated by URL patterns
  if (/[_-](\d{1,2})x(\d{1,2})\b/.test(lower)) return false;

  // PREFER: Alt text that suggests product UI content
  const productAltSignals = /\b(screenshot|screen shot|dashboard|interface|dialog|modal|wizard|configuration|settings|panel|form|report|chart|graph|workflow|module|view|editor|builder|designer|canvas|grid|table|workspace)\b/i;
  const hasProductAlt = productAltSignals.test(alt);

  // REQUIRE: Must be an image file type
  const isImageFile = /\.(png|jpe?g|gif|webp)(\?|$)/i.test(lower) || lower.includes("/images/") || lower.includes("/media/");
  if (!isImageFile) return false;

  // If alt text strongly suggests product UI, accept
  if (hasProductAlt) return true;

  // REJECT: Images from marketing/landing page paths
  if (/\/(header|footer|nav|sidebar|cta|promo|offer|campaign|marquee)\//i.test(lower)) return false;

  // Accept remaining images — the persist step will do a size check
  return true;
}

/** Check if a cached screenshot URL is a viewport capture of a text-heavy page (low value)
 *  vs an inline product UI image (high value) */
function isHighValueCachedScreenshot(screenshotUrl: string): boolean {
  const lower = screenshotUrl.toLowerCase();

  // ACCEPT: External product images hosted on competitor domains (e.g. oracle.com/a/ocom/img/...)
  // These are official product UI screenshots from product pages
  if (!lower.includes("competitor-screenshots") && /^https?:\/\//.test(lower)) {
    // It's an external URL stored directly — accept it (already vetted during crawl)
    return true;
  }

  // REJECT: Ambient crawler viewport captures (filename pattern: ambient-*)
  // These are full-page viewport screenshots of doc/help pages — almost always just text
  if (/\/ambient-/.test(lower)) return false;

  // REJECT: Firecrawl viewport screenshots (contain "screenshot-" UUID pattern from storage.googleapis.com)
  // These are full-page captures that show text-heavy pages, not product UI
  if (/storage\.googleapis\.com\/firecrawl-scrape-media\/screenshot-/i.test(lower)) return false;

  // REJECT: Generic viewport captures that aren't inline product images
  // Only accept inline images (filename pattern: inline-*) from doc/help domains
  if (/\/inline-/.test(lower)) {
    // Reject inline images from marketing/product landing pages
    if (/inline-\d+-www-/.test(lower) && !/inline-\d+-(docs|help|kb|support|community)-/.test(lower)) return false;
    return true;
  }

  // REJECT: Live crawl viewport screenshots (not inline)
  if (/\/live-/.test(lower) && !/\/live-.*inline/i.test(lower)) return false;

  // ACCEPT: Any other storage images (manually uploaded, etc.)
  return true;
}

// Well-known CDN domains that host legitimate product documentation images
const KNOWN_DOC_CDN_DOMAINS = [
  "cdn.document360.io",        // Pigment KB, many SaaS doc sites
  "d2slcw3kip6qmk.cloudfront.net", // Common doc CDN
  "images.ctfassets.net",       // Contentful CDN
  "cdn.sanity.io",              // Sanity CDN
  "res.cloudinary.com",         // Cloudinary CDN
  "cdn.prod.website-files.com", // Webflow CDN
];

async function getAllowedCompetitorDomains(
  supaClient: ReturnType<typeof createClient>,
  competitor: string,
): Promise<Set<string>> {
  const domains = new Set<string>();

  // Always allow known documentation CDN domains for inline images
  for (const cdn of KNOWN_DOC_CDN_DOMAINS) {
    domains.add(cdn);
  }

  const { data: compRows } = await supaClient
    .from("competitors")
    .select("website")
    .eq("name", competitor)
    .limit(1);

  const website = compRows?.[0]?.website;
  if (website) {
    const host = extractHostname(website.startsWith("http") ? website : `https://${website}`);
    if (host) domains.add(host);
  }

  // Also add common KB/docs subdomains for the competitor
  const competitorToken = competitor.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (competitorToken) {
    domains.add(`${competitorToken}.com`);
    domains.add(`kb.${competitorToken}.com`);
    domains.add(`docs.${competitorToken}.com`);
    domains.add(`help.${competitorToken}.com`);
    domains.add(`support.${competitorToken}.com`);
    domains.add(`community.${competitorToken}.com`);
  }

  // For competitors with known alternative domains (e.g. Pigment → gopigment.com + kb.pigment.com)
  // Add KB variants of the base name without common prefixes
  const baseName = competitor.toLowerCase().replace(/^(go|try|get|use|app)/, "").replace(/[^a-z0-9]/g, "");
  if (baseName && baseName !== competitorToken) {
    domains.add(`${baseName}.com`);
    domains.add(`kb.${baseName}.com`);
    domains.add(`docs.${baseName}.com`);
    domains.add(`community.go${baseName}.com`);
  }

  // Also search for pages under name variants (e.g. "Oracle EPM Cloud" pages for "Oracle")
  const nameVariants = getCompetitorNameVariants(competitor);
  for (const variant of nameVariants) {
    const { data: pageRows } = await supaClient
      .from("competitor_pages")
      .select("page_url")
      .eq("competitor_name", variant)
      .limit(100);

    for (const row of pageRows || []) {
      const host = extractHostname(row.page_url || "");
      if (host) domains.add(host);
    }
  }

  return domains;
}

async function getBlockedCompetitorTokens(
  supaClient: ReturnType<typeof createClient>,
  competitor: string,
): Promise<string[]> {
  const { data } = await supaClient
    .from("competitors")
    .select("name")
    .neq("name", competitor)
    .limit(200);

  return (data || [])
    .map((r) => (r.name || "").toLowerCase().replace(/[^a-z0-9]/g, ""))
    .filter((t) => t.length >= 4);
}

async function persistImageToPermanentStorage(
  supaClient: ReturnType<typeof createClient>,
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
    // Reject images under 15KB — too small to be meaningful product UI screenshots
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

/** Standalone YouTube video search — runs independently of image crawl decisions */
async function searchYouTubeVideos(
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
  const seenVideoIds = new Set<string>();
  const videoRefs: string[] = [];

  for (const ytQuery of ytSearchQueries) {
    try {
      console.log(`YouTube search query: ${ytQuery}`);
      const res = await firecrawlFetch("https://api.firecrawl.dev/v1/search", {
        method: "POST",
        body: JSON.stringify({ query: ytQuery, limit: 5 }),
      });
      if (!res.ok) {
        console.log(`YouTube search returned ${res.status} for: ${ytQuery}`);
        continue;
      }
      const data = await res.json();
      for (const result of (data.data || data.results || [])) {
        if (!result.url) continue;
        const ytMatch = result.url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/);
        if (!ytMatch || seenVideoIds.has(ytMatch[1])) continue;

        // Validate: title must contain competitor name (case-insensitive)
        // Use tokens of length >= 2 to catch short acronyms like "EPM", "SAP", "AI"
        const title = (result.title || "").toLowerCase();
        const competitorTokens = competitor.toLowerCase().split(/\s+/).filter(t => t.length >= 2);
        const titleMatchesCompetitor = competitorTokens.some(token => title.includes(token));
        if (!titleMatchesCompetitor) {
          console.log(`YouTube REJECTED (title doesn't match "${competitor}"): ${result.title}`);
          continue;
        }

        seenVideoIds.add(ytMatch[1]);
        const videoUrl = `https://www.youtube.com/watch?v=${ytMatch[1]}`;
        const label = result.title || `${competitor} ${subCategory} video`;
        videoRefs.push(`[YouTube Search Video] ${label}: ${videoUrl}`);
        console.log(`YouTube search found: ${videoUrl} — ${label}`);
      }
      if (seenVideoIds.size >= 4) break;
    } catch (e) {
      console.error("YouTube search error:", e);
    }
  }

  return videoRefs;
}

async function crawlForRelevantMedia(
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

  console.log(`Live crawl for "${competitor}" / "${subCategory}" with ${queries.length} semantic queries`);
  console.log(`Allowed competitor domains: ${[...allowedDomains].join(", ")}`);

  const searchResults: { url: string; title: string; markdown?: string }[] = [];
  const seenResultUrls = new Set<string>();

  const searchPromises = queries.slice(0, 2).map(async (query) => {
    try {
      const domainHint = [...allowedDomains].slice(0, 2).map((d) => `site:${d}`).join(" ");
      const res = await firecrawlFetch("https://api.firecrawl.dev/v1/search", {
        method: "POST",
        body: JSON.stringify({
          query: `${query} ${domainHint}`.trim(),
          limit: 4,
          scrapeOptions: { formats: ["markdown"] },
        }),
      });
      if (!res.ok) return;
      const data = await res.json();
      for (const result of (data.data || data.results || [])) {
        if (!result.url || seenResultUrls.has(result.url)) continue;

        const resultHost = extractHostname(result.url);
        if (!isAllowedDomain(resultHost, allowedDomains)) continue;

        const isRelevant = isPageSemanticlyRelevant(
          {
            title: result.title || "",
            page_url: result.url,
            content_summary: (result.markdown || result.description || "").slice(0, 1000),
          },
          category,
          subCategory,
        );
        if (!isRelevant) continue;

        seenResultUrls.add(result.url);
        searchResults.push({ url: result.url, title: result.title || result.url, markdown: result.markdown || "" });
      }
    } catch (e) {
      console.error("Live search error:", e);
    }
  });

  await Promise.all(searchPromises);

  // Fallback: if strict-domain search yields nothing, run semantic web search without domain restriction
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
            {
              title: result.title || "",
              page_url: result.url,
              content_summary: (result.markdown || result.description || "").slice(0, 1000),
            },
            category,
            subCategory,
          );
          if (!isRelevant) continue;

          seenResultUrls.add(result.url);
          searchResults.push({ url: result.url, title: result.title || result.url, markdown: result.markdown || "" });
        }
      } catch (e) {
        console.error("Live search fallback error:", e);
      }
    });
    await Promise.all(fallbackPromises);
  }

  // Step 2: scrape relevant pages and persist only inline product images (no viewport screenshot capture)
  // For video-only competitors (e.g. Planful), skip image scraping entirely — only YouTube videos matter
  const videoOnly = isVideoOnlyCompetitor(competitor);
  if (searchResults.length > 0 && !videoOnly) {
    // Filter out YouTube/video platform URLs — we only want their video IDs, not to scrape their pages for images
    const scrapableResults = searchResults.filter(r => {
      const isVideoPage = /(?:youtube\.com|youtu\.be|vimeo\.com|wistia\.com|vidyard\.com|loom\.com)/i.test(r.url);
      if (isVideoPage) {
        console.log(`Skipping scrape of video platform URL (extracting videos only): ${r.url}`);
      }
      return !isVideoPage;
    });

    const scrapePromises = scrapableResults.slice(0, 4).map(async ({ url, title, markdown: seedMarkdown }) => {
      try {
        const res = await firecrawlFetch("https://api.firecrawl.dev/v1/scrape", {
          method: "POST",
          body: JSON.stringify({
            url,
            formats: ["markdown", "html"],
            onlyMainContent: true,
          }),
        });
        if (!res.ok) return;
        const data = await res.json();
        const scrapeData = data.data || data;
        const markdown = scrapeData.markdown || seedMarkdown || "";
        const html = scrapeData.html || "";
        const combined = `${markdown}\n${html}`;

        // Extract ALL video URLs from scraped content — YouTube, Vimeo, Wistia, Vidyard, direct video files
        const videoRegexes = [
          /https?:\/\/(?:www\.)?youtube\.com\/watch\?v=([a-zA-Z0-9_-]+)/gi,
          /https?:\/\/(?:www\.)?youtube\.com\/embed\/([a-zA-Z0-9_-]+)/gi,
          /https?:\/\/youtu\.be\/([a-zA-Z0-9_-]+)/gi,
        ];
        const vimeoRegex = /https?:\/\/(?:www\.)?(?:player\.)?vimeo\.com\/(?:video\/)?(\d+)/gi;
        const wistiaRegex = /https?:\/\/[^"'\s]+\.wistia\.com\/(?:medias|embed\/iframe)\/([a-zA-Z0-9]+)/gi;
        const vidyardRegex = /https?:\/\/[^"'\s]*vidyard\.com\/(?:watch|share|embed)\/([a-zA-Z0-9]+)/gi;

        // Also find video links inside <a href="..."> tags pointing to YouTube
        const linkVideoRegex = /<a[^>]+href=["'](https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)[^"']*?)["'][^>]*>/gi;

        // Direct video file URLs (.mp4, .webm, .mov, .ogg)
        const directVideoRegex = /(https?:\/\/[^\s"'<>]+\.(?:mp4|webm|mov|ogg)(?:\?[^\s"'<>]*)?)/gi;

        // <video> tag sources
        const videoTagRegex = /<(?:video|source)[^>]+src=["']([^"']+\.(?:mp4|webm|mov|ogg)(?:\?[^"']*)?)["'][^>]*>/gi;

        // Loom video URLs
        const loomRegex = /https?:\/\/(?:www\.)?loom\.com\/(?:share|embed)\/([a-zA-Z0-9]+)/gi;

        for (const re of videoRegexes) {
          let vm;
          while ((vm = re.exec(combined)) !== null) {
            if (!seenVideoIds.has(vm[1])) {
              seenVideoIds.add(vm[1]);
              const videoUrl = `https://www.youtube.com/watch?v=${vm[1]}`;
              mediaRefs.push(`[Live Crawl Video] ${title || competitor} - ${subCategory}: ${videoUrl}`);
              if (!newPages.includes(url)) newPages.push(url);
            }
          }
        }

        // Vimeo
        let vimeoMatch;
        while ((vimeoMatch = vimeoRegex.exec(combined)) !== null) {
          const vimeoId = vimeoMatch[1];
          if (!seenVideoIds.has(`vimeo-${vimeoId}`)) {
            seenVideoIds.add(`vimeo-${vimeoId}`);
            mediaRefs.push(`[Live Crawl Video] ${title || competitor} - ${subCategory}: https://vimeo.com/${vimeoId}`);
            if (!newPages.includes(url)) newPages.push(url);
          }
        }

        // Wistia
        let wistiaMatch;
        while ((wistiaMatch = wistiaRegex.exec(combined)) !== null) {
          const wistiaId = wistiaMatch[1];
          if (!seenVideoIds.has(`wistia-${wistiaId}`)) {
            seenVideoIds.add(`wistia-${wistiaId}`);
            mediaRefs.push(`[Live Crawl Video] ${title || competitor} Wistia - ${subCategory}: ${wistiaMatch[0]}`);
            if (!newPages.includes(url)) newPages.push(url);
          }
        }

        // Vidyard
        let vidyardMatch;
        while ((vidyardMatch = vidyardRegex.exec(combined)) !== null) {
          const vidyardId = vidyardMatch[1];
          if (!seenVideoIds.has(`vidyard-${vidyardId}`)) {
            seenVideoIds.add(`vidyard-${vidyardId}`);
            mediaRefs.push(`[Live Crawl Video] ${title || competitor} Vidyard - ${subCategory}: ${vidyardMatch[0]}`);
            if (!newPages.includes(url)) newPages.push(url);
          }
        }

        // Direct video files (.mp4, .webm, .mov, .ogg)
        let directMatch;
        while ((directMatch = directVideoRegex.exec(combined)) !== null) {
          const videoFileUrl = directMatch[1];
          const dedupeKey = `direct-${videoFileUrl.replace(/\?.*$/, "")}`;
          if (!seenVideoIds.has(dedupeKey)) {
            seenVideoIds.add(dedupeKey);
            mediaRefs.push(`[Live Crawl Video] ${title || competitor} direct video - ${subCategory}: ${videoFileUrl}`);
            if (!newPages.includes(url)) newPages.push(url);
            console.log(`Direct video file found: ${videoFileUrl.slice(0, 120)}`);
          }
        }

        // <video> tag sources
        let videoTagMatch;
        while ((videoTagMatch = videoTagRegex.exec(combined)) !== null) {
          let videoSrc = videoTagMatch[1];
          try { videoSrc = new URL(videoSrc, url).toString(); } catch { continue; }
          const dedupeKey = `vtag-${videoSrc.replace(/\?.*$/, "")}`;
          if (!seenVideoIds.has(dedupeKey)) {
            seenVideoIds.add(dedupeKey);
            mediaRefs.push(`[Live Crawl Video] ${title || competitor} embedded video - ${subCategory}: ${videoSrc}`);
            if (!newPages.includes(url)) newPages.push(url);
            console.log(`Video tag source found: ${videoSrc.slice(0, 120)}`);
          }
        }

        // Loom videos
        let loomMatch;
        while ((loomMatch = loomRegex.exec(combined)) !== null) {
          const loomId = loomMatch[1];
          if (!seenVideoIds.has(`loom-${loomId}`)) {
            seenVideoIds.add(`loom-${loomId}`);
            mediaRefs.push(`[Live Crawl Video] ${title || competitor} Loom - ${subCategory}: https://www.loom.com/share/${loomId}`);
            if (!newPages.includes(url)) newPages.push(url);
          }
        }

        // Link-based YouTube references (e.g. <a href="youtube.com/watch?v=...">)
        let linkMatch;
        while ((linkMatch = linkVideoRegex.exec(combined)) !== null) {
          const ytId = linkMatch[2];
          if (ytId && !seenVideoIds.has(ytId)) {
            seenVideoIds.add(ytId);
            const videoUrl = `https://www.youtube.com/watch?v=${ytId}`;
            mediaRefs.push(`[Live Crawl Video] ${title || competitor} linked video - ${subCategory}: ${videoUrl}`);
            if (!newPages.includes(url)) newPages.push(url);
          }
        }

        // Also extract animated GIFs as media (they often show product workflows)
        const gifRegex = /(https?:\/\/[^\s"'<>]+\.gif(?:\?[^\s"'<>]*)?)/gi;
        let gifMatch;
        const seenGifs = new Set<string>();
        while ((gifMatch = gifRegex.exec(combined)) !== null) {
          const gifUrl = gifMatch[1];
          const normalizedGif = gifUrl.replace(/\?.*$/, "");
          if (seenGifs.has(normalizedGif)) continue;
          seenGifs.add(normalizedGif);
          // Only persist GIFs that pass the product UI filter
          if (!isLikelyProductUiImage(gifUrl, "")) continue;
          const persistedGif = await persistImageToPermanentStorage(
            supaClient, SUPABASE_URL, competitor, url, gifUrl, mediaRefs.length + 1,
          );
          if (persistedGif && !persistedUrlSet.has(persistedGif)) {
            persistedUrlSet.add(persistedGif);
            mediaRefs.push(`[Live Crawl GIF] ${title || competitor} animated demo - ${subCategory}: ${persistedGif}`);
            if (!newPages.includes(url)) newPages.push(url);
            console.log(`Animated GIF persisted: ${persistedGif.slice(0, 120)}`);
          }
        }

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
          if (!/^https?:\/\//i.test(imgUrl)) continue;
          if (seenCandidateUrls.has(imgUrl)) continue;
          seenCandidateUrls.add(imgUrl);
          imageCandidates.push({ altText, imgUrl });
        }

        for (const m of rawHtmlMatches) {
          const rawUrl = (m[1] || "").trim();
          const htmlAlt = (m[2] || "").toLowerCase();
          if (!rawUrl) continue;
          let imgUrl = rawUrl;
          try { imgUrl = new URL(rawUrl, url).toString(); } catch { continue; }
          if (!/^https?:\/\//i.test(imgUrl)) continue;
          if (seenCandidateUrls.has(imgUrl)) continue;
          seenCandidateUrls.add(imgUrl);
          imageCandidates.push({ altText: htmlAlt, imgUrl });
        }

        if (imageCandidates.length === 0) return;
        let inlineCount = 0;

        for (const candidate of imageCandidates) {
          const altText = candidate.altText;
          const imgUrl = candidate.imgUrl;
          if (!imgUrl || !isLikelyProductUiImage(imgUrl, altText)) continue;

          const combined = `${altText} ${imgUrl.toLowerCase()} ${(title || "").toLowerCase()} ${url.toLowerCase()}`;
          if (blockedCompetitorTokens.some((token) => combined.includes(token))) continue;

          const persistedInline = await persistImageToPermanentStorage(
            supaClient,
            SUPABASE_URL,
            competitor,
            url,
            imgUrl,
            mediaRefs.length + inlineCount + 1,
          );
          inlineCount += 1;

          if (persistedInline && !persistedUrlSet.has(persistedInline)) {
            persistedUrlSet.add(persistedInline);
            mediaRefs.push(`[Live Crawl Inline] ${title || competitor} - ${subCategory}: ${persistedInline}`);
            if (!newPages.includes(url)) newPages.push(url);
          }

          if (inlineCount >= 5) break;
        }
      } catch (e) {
        console.error("Live scrape error:", e);
      }
    });

    await Promise.all(scrapePromises);
  }

  console.log(`Live crawl found ${mediaRefs.length} media items from ${newPages.length} new pages`);
  for (const ref of mediaRefs) {
    console.log(`  MEDIA: ${ref.slice(0, 200)}`);
  }
  return { mediaRefs, newPages };
}

// ===== Gallery-first media lookup =====
// Check media_assets table for existing media before triggering any crawl

interface GalleryMediaResult {
  galleryMedia: string[];       // formatted media lines for prompt
  galleryUrls: Set<string>;     // raw URLs already in gallery (for dedup)
  count: number;
  /** For Full Product: map of product_sub_area → count */
  subAreaCounts?: Record<string, number>;
}

async function getGalleryMedia(
  competitor: string,
  category: string,
  subCategory: string,
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

  // For specific product areas, filter to that area; for Full Product, get all
  if (!isFullProduct) {
    query = query.eq("product_area", category).eq("product_sub_area", subCategory);
  }

  const { data: assets, error } = await query.limit(50);

  // If specific sub-area returns 0 results, return empty — don't broaden to other areas
  if ((!assets || assets.length === 0) && !isFullProduct) {
    console.log(`Gallery lookup: 0 assets for "${competitor}" / "${subCategory}" — returning empty (no fallback)`);
    return { galleryMedia: [], galleryUrls: new Set(), count: 0 };
  }

  if (!assets || assets.length === 0) {
    console.log(`Gallery lookup: 0 assets for "${competitor}" (Full Product)`);
    return { galleryMedia: [], galleryUrls: new Set(), count: 0 };
  }

  if (error || !assets || assets.length === 0) {
    console.log(`Gallery lookup: 0 assets for "${competitor}" / "${subCategory}"`);
    return { galleryMedia: [], galleryUrls: new Set(), count: 0 };
  }

  return buildGalleryResult(assets, competitor, isFullProduct, isFullProduct ? "Full Product" : subCategory);
}

function buildGalleryResult(
  assets: any[],
  competitor: string,
  isFullProduct: boolean,
  labelContext: string,
): GalleryMediaResult {
  const galleryMedia: string[] = [];
  const galleryUrls = new Set<string>();
  const subAreaCounts: Record<string, number> = {};

  for (const asset of assets) {
    const storageUrl = asset.storage_url || "";
    const cdnUrl = asset.cdn_url || "";
    const isPermanentStorage = storageUrl.includes("supabase.co/storage/");
    const url = isPermanentStorage ? storageUrl : (cdnUrl || storageUrl);
    if (!url) continue;
    const normalizedUrl = url.replace(/\?.*$/, "");
    if (galleryUrls.has(normalizedUrl)) continue;
    galleryUrls.add(normalizedUrl);

    const subArea = asset.product_sub_area || "Unknown";
    subAreaCounts[subArea] = (subAreaCounts[subArea] || 0) + 1;

    const isVideo = asset.media_type === "video" || /\.(?:mp4|webm|mov)(?:\?|$)/i.test(url) ||
      url.includes("youtube.com") || url.includes("youtu.be") || url.includes("vimeo.com");
    const label = asset.alt_text || `${asset.competitor_name} ${asset.product_sub_area} - ${asset.media_type}`;
    const pageUrlSuffix = asset.page_url ? ` (from ${asset.page_url})` : "";

    if (isVideo) {
      galleryMedia.push(`[Gallery Video] ${label}${pageUrlSuffix}: ${url}`);
    } else {
      galleryMedia.push(`[Gallery Image] ${label}${pageUrlSuffix}: ${url}`);
    }
  }

  console.log(`Gallery lookup: ${galleryMedia.length} active assets for "${competitor}" / "${labelContext}"`);
  return { galleryMedia, galleryUrls, count: galleryMedia.length, subAreaCounts };
}

/** For Full Product: determine which product sub-areas are missing media and optionally trigger bulk-media-crawl */
async function handleFullProductMediaThreshold(
  competitor: string,
  galleryResult: GalleryMediaResult,
): Promise<{ skipCrawl: boolean; missingSubAreas: string[] }> {
  const totalCount = galleryResult.count;

  // All known product sub-areas from the taxonomy
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

  // Find sub-areas with zero media
  const coveredSubAreas = new Set(Object.keys(galleryResult.subAreaCounts || {}));
  const missingSubAreas = ALL_SUB_AREAS.filter(sa => !coveredSubAreas.has(sa));

  if (totalCount === 0) {
    console.log(`Full Product media threshold: 0 media — will trigger bulk crawl for ALL areas for "${competitor}"`);
    // Trigger bulk-media-crawl for all product areas (fire-and-forget)
    try {
      const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
      const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
        fetch(`${SUPABASE_URL}/functions/v1/bulk-media-crawl`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            "apikey": SUPABASE_SERVICE_ROLE_KEY,
          },
          body: JSON.stringify({ competitor_name: competitor }),
        }).catch(e => console.error("bulk-media-crawl trigger error:", e));
        console.log(`Triggered bulk-media-crawl for "${competitor}" (all areas)`);
      }
    } catch (e) {
      console.error("Failed to trigger bulk-media-crawl:", e);
    }
    return { skipCrawl: false, missingSubAreas: ALL_SUB_AREAS };
  }

  // 1-8 media: crawl only missing areas
  console.log(`Full Product media threshold: ${totalCount} media (1-8) — will crawl ${missingSubAreas.length} missing areas for "${competitor}"`);
  if (missingSubAreas.length > 0) {
    try {
      const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
      const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
        fetch(`${SUPABASE_URL}/functions/v1/bulk-media-crawl`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            "apikey": SUPABASE_SERVICE_ROLE_KEY,
          },
          body: JSON.stringify({ competitor_name: competitor, product_sub_areas: missingSubAreas }),
        }).catch(e => console.error("bulk-media-crawl trigger error:", e));
        console.log(`Triggered bulk-media-crawl for "${competitor}" — missing areas: ${missingSubAreas.join(", ")}`);
      }
    } catch (e) {
      console.error("Failed to trigger bulk-media-crawl:", e);
    }
  }
  return { skipCrawl: false, missingSubAreas };
}

// ===== Cached intelligence retrieval with semantic filtering =====

async function getCachedIntelligence(
  competitor: string, subCategory: string, category: string
): Promise<{ intelligence: string; media: string; hasCachedData: boolean; hasRelevantMedia: boolean }> {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return { intelligence: "", media: "", hasCachedData: false, hasRelevantMedia: false };

  const supaClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Try exact match first, then fuzzy variants
  const nameVariants = getCompetitorNameVariants(competitor);
  console.log(`getCachedIntelligence: searching for "${competitor}" with variants: ${nameVariants.join(", ")}`);

  const { data: pages } = await supaClient
    .from("competitor_pages")
    .select("content_summary, page_type, page_url, title, screenshot_urls, metadata")
    .in("competitor_name", nameVariants)
    .eq("crawl_status", "completed")
    .not("content_summary", "is", null)
    .order("content_updated_at", { ascending: false })
    .limit(15);

  if (!pages || pages.length === 0) return { intelligence: "", media: "", hasCachedData: false, hasRelevantMedia: false };

  const intelligenceParts: string[] = [];
  const mediaRefs: string[] = [];

  for (const page of pages) {
    if (page.content_summary) {
      intelligenceParts.push(`[Pre-crawled ${page.page_type}: ${page.page_url}] ${page.content_summary.slice(0, 2000)}`);
    }
    // Only include screenshots that pass the quality gate
    // For video-only competitors, skip all cached images — only videos are useful
    if (page.screenshot_urls && page.screenshot_urls.length > 0 && !isVideoOnlyCompetitor(competitor)) {
      const relevant = isPageSemanticlyRelevant(page, category, subCategory);
      if (relevant) {
        for (const sUrl of page.screenshot_urls) {
          if (!isHighValueCachedScreenshot(sUrl)) {
            console.log(`Quality gate REJECTED cached screenshot: ${sUrl.split("/").pop()}`);
            continue;
          }
          const label = `${competitor} ${page.page_type || "page"} - ${page.title || "Product UI"}`;
          mediaRefs.push(`[Official Image] ${label} (product screenshot): ${sUrl}`);
        }
      } else {
        console.log(`Skipping ${page.screenshot_urls.length} screenshots from semantically irrelevant page: "${page.title}" for product area "${subCategory}"`);
      }
    }
    // Extract video URLs from page metadata (stored by screenshot-worker)
    const pageMeta = (page as any).metadata as Record<string, unknown> | null;
    if (pageMeta && Array.isArray(pageMeta.video_urls) && pageMeta.video_urls.length > 0) {
      const relevant = isPageSemanticlyRelevant(page, category, subCategory);
      if (relevant) {
        for (const vUrl of pageMeta.video_urls) {
          if (typeof vUrl === "string" && vUrl.startsWith("http")) {
            const label = `${competitor} ${page.title || "Product Video"} - ${subCategory}`;
            mediaRefs.push(`[Official Video] ${label}: ${vUrl}`);
          }
        }
        console.log(`Added ${pageMeta.video_urls.length} video URLs from page: "${page.title}"`);
      }
    }
    // Also extract embedded video URLs from page content (may have been missed by screenshot-worker)
    if (page.content_summary) {
      const summary = page.content_summary;
      const embeddedVideoRegexes = [
        /https?:\/\/(?:www\.)?youtube\.com\/watch\?v=([a-zA-Z0-9_-]+)/gi,
        /https?:\/\/(?:www\.)?youtube\.com\/embed\/([a-zA-Z0-9_-]+)/gi,
        /https?:\/\/youtu\.be\/([a-zA-Z0-9_-]+)/gi,
      ];
      for (const re of embeddedVideoRegexes) {
        let vm;
        while ((vm = re.exec(summary)) !== null) {
          const videoUrl = `https://www.youtube.com/watch?v=${vm[1]}`;
          if (!mediaRefs.some(r => r.includes(vm[1]))) {
            const label = `${competitor} ${page.title || "Product Video"} - ${subCategory}`;
            mediaRefs.push(`[Embedded Video] ${label}: ${videoUrl}`);
          }
        }
      }
    }
  }

  console.log(`Cached intelligence: ${pages.length} pages, ${intelligenceParts.length} summaries, ${mediaRefs.length} relevant screenshots for "${subCategory}"`);

  const mediaContext = mediaRefs.length > 0
    ? `--- AVAILABLE OFFICIAL MEDIA ---\nThe following ${mediaRefs.length} official images were found from ${competitor}'s official channels relevant to "${subCategory}". Include ALL of them in your Visual Overview section:\n\n${mediaRefs.join("\n")}\n--- END MEDIA ---`
    : "";

  return {
    intelligence: intelligenceParts.join("\n\n"),
    media: mediaContext,
    hasCachedData: intelligenceParts.length > 0,
    hasRelevantMedia: mediaRefs.length > 0,
  };
}

// ===== Live intelligence gathering (only when no cache) =====
async function gatherLiveIntelligenceAndMedia(
  competitor: string, subCategory: string, category: string
): Promise<{ intelligence: string; media: string }> {
  const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");

  const productAreaDesc = getProductAreaDescription(category, subCategory);
  const shortContext = productAreaDesc ? productAreaDesc.split(".").slice(0, 2).join(".") + "." : "";
  const semanticHint = shortContext ? ` Focus on: ${shortContext}` : "";

  const intelligenceResults: string[] = [];
  const mediaRefs: string[] = [];
  const competitorSlug = competitor.toLowerCase().replace(/\s+/g, "");

  const parallelTasks: Promise<void>[] = [];

  // Claude broad search
  if (ANTHROPIC_API_KEY) {
    parallelTasks.push(
      claudeWebSearch(
        `Find detailed info about "${competitor}" competing with Workday Adaptive Planning in ${subCategory} (${category}).${semanticHint} Include: features, pricing, integrations, architecture. Provide source URLs.`,
        3
      ).then(results => {
        for (const r of results) intelligenceResults.push(r.slice(0, 1500));
      })
    );
  }

  if (hasFirecrawlKey()) {
    // Firecrawl search
    parallelTasks.push(
      firecrawlFetch("https://api.firecrawl.dev/v1/search", {
        method: "POST",
        body: JSON.stringify({ query: `${competitor} ${subCategory} ${category} features capabilities`, limit: 3, scrapeOptions: { formats: ["markdown"] } }),
      }).then(async r => {
        if (!r.ok) return;
        const d = await r.json();
        for (const result of (d.data || d.results || [])) {
          const content = result.markdown || result.description || "";
          if (content) intelligenceResults.push(`[Firecrawl: ${result.url || ""}] ${content.slice(0, 1500)}`);
        }
      }).catch(e => console.error("Firecrawl error:", e))
    );

    // Firecrawl scrape competitor website
    parallelTasks.push(
      (async () => {
        for (const prefix of ["www.", ""]) {
          try {
            const url = `https://${prefix}${competitorSlug}.com`;
            const res = await firecrawlFetch("https://api.firecrawl.dev/v1/scrape", {
              method: "POST",
              body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true }),
            });
            if (!res.ok) continue;
            const data = await res.json();
            const markdown = data.data?.markdown || data.markdown || "";
            if (markdown) {
              intelligenceResults.push(`[Scraped: ${url}] ${markdown.slice(0, 2000)}`);
              break;
            }
          } catch { /* skip */ }
        }
      })()
    );
  }

  await Promise.all(parallelTasks);

  // Simple heuristic media filtering (no LLM validation — optimization D)
  const finalMedia = mediaRefs.filter(ref => {
    const url = ref.match(/https?:\/\/[^\s)]+/)?.[0] || "";
    if (/\b(icon|favicon|avatar|badge|pixel|tracking|social)\b/i.test(url)) return false;
    return true;
  });

  const mediaContext = finalMedia.length > 0
    ? `--- AVAILABLE OFFICIAL MEDIA ---\n${finalMedia.join("\n")}\n--- END MEDIA ---`
    : "";

  return { intelligence: intelligenceResults.join("\n\n"), media: mediaContext };
}

// ===== Media Quality Agent integration =====
// Calls the media-quality-agent edge function to rate all media items using AI vision
// and discover additional YouTube videos. Only media scoring ≥7 is included.

interface ParsedMediaItem {
  url: string;
  label: string;
  type: "image" | "video" | "gif";
  originalLine: string;
}

function parseMediaFromContext(mediaContext: string): ParsedMediaItem[] {
  if (!mediaContext) return [];
  const items: ParsedMediaItem[] = [];
  const seenUrls = new Set<string>();

  for (const line of mediaContext.split("\n")) {
    const urlMatch = line.match(/(https?:\/\/[^\s)]+)/);
    if (!urlMatch) continue;
    const url = urlMatch[1];
    const dedupeKey = url.replace(/\?.*$/, "");
    if (seenUrls.has(dedupeKey)) continue;
    seenUrls.add(dedupeKey);

    const isVideo = url.includes("youtube.com/watch") || url.includes("youtu.be/") ||
      url.includes("vimeo.com/") || url.includes("wistia.com/") ||
      url.includes("vidyard.com/") || url.includes("loom.com/") ||
      /\.(?:mp4|webm|mov|ogg)(?:\?|$)/i.test(url);
    const isGif = /\.gif(?:\?|$)/i.test(url);
    const isImage = !isVideo && (/\.(?:png|jpe?g|webp)(?:\?|$)/i.test(url) || url.includes("competitor-screenshots"));

    if (!isVideo && !isGif && !isImage) continue;

    // Extract label from the line
    const labelMatch = line.match(/\]\s*(.+?)(?:\s*\(|:\s*https?)/);
    const label = labelMatch ? labelMatch[1].trim() : line.replace(/https?:\/\/[^\s]+/g, "").replace(/[\[\]]/g, "").trim().slice(0, 120) || "Media item";

    items.push({
      url,
      label,
      type: isVideo ? "video" : isGif ? "gif" : "image",
      originalLine: line,
    });
  }

  return items;
}

async function filterMediaWithQualityAgent(
  mediaContext: string,
  competitor: string,
  category: string,
  subCategory: string,
): Promise<string> {
  if (!mediaContext) return "";

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return mediaContext; // fallback: return unfiltered

  const parsedMedia = parseMediaFromContext(mediaContext);
  if (parsedMedia.length === 0) return mediaContext;

  console.log(`Media Quality Agent: sending ${parsedMedia.length} items for AI evaluation`);

  // Extract existing video IDs to avoid duplicates in discovery
  const existingVideoIds: string[] = [];
  for (const item of parsedMedia) {
    if (item.type === "video") {
      const match = item.url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/);
      if (match) existingVideoIds.push(match[1]);
    }
  }

  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/media-quality-agent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
      },
      body: JSON.stringify({
        competitor,
        category,
        subCategory,
        mediaItems: parsedMedia.map(m => ({ url: m.url, label: m.label, type: m.type })),
        existingVideoIds,
      }),
    });

    if (!res.ok) {
      console.error(`Media Quality Agent returned ${res.status}`);
      return mediaContext; // fallback
    }

    const result = await res.json();
    const approved = result.filteredMedia || [];
    const rejected = result.rejectedMedia || [];
    const discoveredVideos = result.discoveredVideos || [];

    console.log(`Media Quality Agent verdict: ${approved.length} approved, ${rejected.length} rejected, ${discoveredVideos.length} new YT videos`);

    // Rebuild media context with only approved items
    const approvedUrls = new Set(approved.map((m: any) => m.url.replace(/\?.*$/, "")));
    const filteredLines: string[] = [];

    for (const item of parsedMedia) {
      const normalizedUrl = item.url.replace(/\?.*$/, "");
      if (approvedUrls.has(normalizedUrl)) {
        filteredLines.push(item.originalLine);
      }
    }

    // Add discovered YouTube videos
    for (const video of discoveredVideos) {
      const label = `${competitor} ${video.title} - ${subCategory}`;
      filteredLines.push(`[Discovered Video] ${label}: ${video.url}`);
    }

    if (filteredLines.length === 0) return "";

    return `--- AVAILABLE OFFICIAL MEDIA (AI-verified, score ≥7) ---\n${filteredLines.join("\n")}\n--- END MEDIA ---`;
  } catch (err) {
    console.error("Media Quality Agent call failed:", err);
    return mediaContext; // fallback: return unfiltered
  }
}

async function claudeWebSearch(query: string, maxUses = 3): Promise<string[]> {
  const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
  if (!ANTHROPIC_API_KEY) return [];

  try {
    console.log("Claude web search:", query.slice(0, 120));
    const res = await monitoredFetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 3000,
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: maxUses }],
        messages: [{ role: "user", content: query }],
      }),
    }, { keyName: "ANTHROPIC_API_KEY", service: "anthropic", edgeFunction: "chat-analysis" });

    if (!res.ok) {
      console.error("Claude web search error:", res.status);
      await res.text();
      return [];
    }

    const data = await res.json();
    const results: string[] = [];
    for (const block of data.content || []) {
      if (block.type === "text") results.push(block.text);
      else if (block.type === "web_search_tool_result") {
        for (const sr of block.content || []) {
          if (sr.type === "web_search_result") {
            results.push(`[Source: ${sr.url}] ${sr.title}: ${(sr.page_content || sr.encrypted_content || "").slice(0, 500)}`);
          }
        }
      }
    }
    return results;
  } catch (err) {
    console.error("Claude web search error:", err);
    return [];
  }
}

// ===== OPTIMIZATION D: Simplified research router — no LLM call =====
function needsResearch(message: string, history: any[]): boolean {
  if (!history || history.length === 0) return true;
  const lower = message.toLowerCase();
  // Simple heuristic: if user asks about a different topic or requests new research
  if (/\b(compare|analyze|tell me about|what about|how does|research|find|search|look up)\b/i.test(lower)) return true;
  return false;
}

// ===== Intent detection: is the follow-up related to the competitive analysis context? =====
function isFollowUpRelatedToAnalysis(
  message: string,
  competitor: string,
  category: string,
  subCategory: string,
  history: any[],
): boolean {
  // First message is always related (it initiates the analysis)
  if (!history || history.length === 0) return true;

  const lower = message.toLowerCase();
  const competitorLower = competitor.toLowerCase();
  const categoryLower = category.toLowerCase();
  const subCategoryLower = subCategory.toLowerCase();

  // Check if the message mentions the competitor, category, or sub-category
  const competitorTokens = competitorLower.split(/\s+/).filter(t => t.length >= 3);
  const mentionsCompetitor = competitorTokens.some(t => lower.includes(t));
  const mentionsCategory = lower.includes(categoryLower) || lower.includes(subCategoryLower);

  // Check for competitive analysis / EPM / FP&A domain terms
  const domainTerms = /\b(workday|adaptive|planning|epm|fpa|fp&a|forecast|budget|consolidat|report|model|sheet|cube|hcm|erp|saas|competitor|competitive|comparison|versus|vs\.?|strength|weakness|gap|feature|capability|integration|workflow|dashboard|analytics|ai\s+capabilit)\b/i;
  const mentionsDomain = domainTerms.test(lower);

  // Check for explicit references to "the analysis", "the comparison", "above", "previous", etc.
  const referencesContext = /\b(the analysis|the comparison|the report|the response|above|previous|you mentioned|you said|earlier|that point|this area|those|these features|the table|the section)\b/i.test(lower);

  // If any of these signals fire, it's related
  if (mentionsCompetitor || mentionsCategory || mentionsDomain || referencesContext) return true;

  // Check if the last assistant message in history is long (i.e. a full analysis) and
  // the follow-up is short and generic — likely an independent question
  const lastAssistant = [...(history || [])].reverse().find((m: any) => m.role === "assistant");
  if (lastAssistant && lastAssistant.content && lastAssistant.content.length > 2000) {
    // Long analysis context exists. If the follow-up doesn't match any domain signals, treat as independent.
    return false;
  }

  // Default: treat as related for safety
  return true;
}

interface JudgeEvaluation {
  factual_correctness: { score: number; reasoning: string };
  structural_clarity: { score: number; reasoning: string };
  depth_of_comparison: { score: number; reasoning: string };
  visual_evidence: { score: number; reasoning: string };
  citation_coverage: { score: number; reasoning: string };
  actionability: { score: number; reasoning: string };
  media_quality: { score: number; reasoning: string };
  overall_score: number;
  overall_summary: string;
  improvement_suggestions: string[];
}

const JUDGE_TOOL = {
  type: "function" as const,
  function: {
    name: "submit_evaluation",
    description: "Submit a structured evaluation of a competitive analysis response.",
    parameters: {
      type: "object",
      properties: {
        factual_correctness: {
          type: "object",
          properties: { score: { type: "number" }, reasoning: { type: "string" } },
          required: ["score", "reasoning"], additionalProperties: false,
        },
        structural_clarity: {
          type: "object",
          properties: { score: { type: "number" }, reasoning: { type: "string" } },
          required: ["score", "reasoning"], additionalProperties: false,
        },
        depth_of_comparison: {
          type: "object",
          properties: { score: { type: "number" }, reasoning: { type: "string" } },
          required: ["score", "reasoning"], additionalProperties: false,
        },
        visual_evidence: {
          type: "object",
          properties: { score: { type: "number" }, reasoning: { type: "string" } },
          required: ["score", "reasoning"], additionalProperties: false,
        },
        citation_coverage: {
          type: "object",
          properties: { score: { type: "number" }, reasoning: { type: "string" } },
          required: ["score", "reasoning"], additionalProperties: false,
        },
        actionability: {
          type: "object",
          properties: { score: { type: "number" }, reasoning: { type: "string" } },
          required: ["score", "reasoning"], additionalProperties: false,
        },
        media_quality: {
          type: "object",
          properties: { score: { type: "number" }, reasoning: { type: "string" } },
          required: ["score", "reasoning"], additionalProperties: false,
        },
        overall_score: { type: "number" },
        overall_summary: { type: "string" },
        improvement_suggestions: { type: "array", items: { type: "string" } },
      },
      required: ["factual_correctness", "structural_clarity", "depth_of_comparison", "visual_evidence", "citation_coverage", "actionability", "media_quality", "overall_score", "overall_summary", "improvement_suggestions"],
      additionalProperties: false,
    }
  }
};

async function evaluateResponse(content: string, competitor: string, subCategory: string): Promise<JudgeEvaluation | null> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) return null;

  try {
    const res = await monitoredFetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${LOVABLE_API_KEY}` },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [{
          role: "user",
          content: `You are an expert Competitive Intelligence Quality Judge. Evaluate this competitive analysis of "${competitor}" vs Workday Adaptive Planning in "${subCategory}".

Score each criterion 1-10 with specific reasoning. Weighting: factual_correctness(22%) + depth_of_comparison(22%) + structural_clarity(13%) + actionability(13%) + citation_coverage(10%) + visual_evidence(10%) + media_quality(10%).

RESPONSE TO EVALUATE:
${content.slice(0, 12000)}`,
        }],
        tools: [JUDGE_TOOL],
        tool_choice: { type: "function", function: { name: "submit_evaluation" } },
      }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      return JSON.parse(toolCall.function.arguments) as JudgeEvaluation;
    }
    const raw = data.choices?.[0]?.message?.content || "";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]) as JudgeEvaluation;
    return null;
  } catch (e) {
    console.error("Judge error:", e);
    return null;
  }
}

/** Fire-and-forget: persist newly approved crawl media to media_assets so future lookups find them */
async function persistNewMediaToGallery(
  competitor: string, category: string, subCategory: string, mediaLines: string[],
): Promise<void> {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return;

  const supaClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  let inserted = 0;

  for (const line of mediaLines) {
    const urlMatch = line.match(/(https?:\/\/[^\s)]+)/);
    if (!urlMatch) continue;
    const url = urlMatch[1];

    // Skip video URLs — only persist images/gifs
    const isVideo = url.includes("youtube.com") || url.includes("youtu.be") || url.includes("vimeo.com") ||
      url.includes("wistia.com") || url.includes("vidyard.com") || url.includes("loom.com") ||
      /\.(?:mp4|webm|mov|ogg)(?:\?|$)/i.test(url);
    if (isVideo) continue;

    // Check if already in gallery
    const normalizedUrl = url.replace(/\?.*$/, "");
    const { count } = await supaClient
      .from("media_assets")
      .select("id", { count: "exact", head: true })
      .or(`storage_url.eq.${url},cdn_url.eq.${url}`)
      .eq("competitor_name", competitor)
      .eq("is_active", true);

    if ((count || 0) > 0) continue;

    // Extract label for alt_text
    const labelMatch = line.match(/\]\s*(.+?)(?:\s*\(|:\s*https?)/);
    const altText = labelMatch ? labelMatch[1].trim().slice(0, 200) : `${competitor} ${subCategory}`;

    const mediaType = /\.gif(?:\?|$)/i.test(url) ? "gif" : "image";

    const { error } = await supaClient.from("media_assets").insert({
      competitor_name: competitor,
      product_area: category,
      product_sub_area: subCategory,
      storage_url: url,
      cdn_url: url,
      media_type: mediaType,
      alt_text: altText,
      source_type: "live-crawl",
      page_url: url,
      is_active: true,
      metadata: { crawl_source: "chat-analysis-auto-persist", persisted_at: new Date().toISOString() },
    });

    if (!error) {
      inserted++;
    } else {
      console.error(`Failed to persist media to gallery: ${error.message}`);
    }
  }

  if (inserted > 0) {
    console.log(`persistNewMediaToGallery: inserted ${inserted} new assets for "${competitor}" / "${subCategory}"`);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const traceStartTime = Date.now();
  const toolCallsLog: any[] = [];
  const retrievedDocs: any[] = [];

  const sseHeaders = {
    ...corsHeaders,
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
  };

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabaseAuth = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: userErr } = await supabaseAuth.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabaseService = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { category, subCategory, competitor, competitors: competitorsList, message, threadId, history, isNewsSummary, newsContext } = await req.json();
    // competitorsList is an array when multi-competitor, competitor is the joined label
    const allCompetitors: string[] = Array.isArray(competitorsList) && competitorsList.length > 0 ? competitorsList : (competitor ? [competitor] : []);

    // ===== NEWS SUMMARY MODE =====
    if (isNewsSummary && newsContext) {
      const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
      if (!LOVABLE_API_KEY) {
        return new Response(JSON.stringify({ error: "AI not configured" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const agentSource = "feed_agent";

      const newsSystemPrompt = `You are a Competitive Intelligence News Analyst specializing in FP&A and EPM software. You help users understand and analyze competitive news and community discussions.

CRITICAL RULES:
1. You HAVE full access to all the news and community items listed below. These were fetched and curated by our intelligence system.
2. NEVER say phrases like "I don't have access to", "I cannot verify", "I'm unable to retrieve", "I don't have real-time access", "I cannot browse", or similar disclaimers. You have the data right here.
3. If asked about something not covered in the data below, say "Based on the current feed, there are no items matching that criteria" — NOT "I don't have access."
4. Never expose internal adaptive planning data or proprietary information.
5. Always respond as if you are fully informed — because you are. The data below IS your knowledge base for this conversation.

Here are ALL the news/community items currently visible to the user:

--- NEWS ITEMS DATA (${(newsContext.match(/\[(\d+)\]/g) || []).length} items) ---
${newsContext}
--- END DATA ---

FORMATTING RULES:
- Use ## for section headers
- Use bullet lists for key points
- Be concise and actionable
- Focus on competitive implications and strategic insights
- Reference specific articles/sources by their title and source name
- When summarizing, group by competitor/vendor for clarity
- IMPORTANT: Always embed hyperlinks to source articles using markdown link syntax [Article Title](URL). Every time you reference an article, link to it. This is critical for user experience.
- Example: "According to [Anaplan Launches New AI Features](https://example.com/article), the platform now supports..."
- Never show raw URLs without markdown link formatting`;

      const sanitizedNewsHistory = (history || []).filter(
        (msg: any) => msg && typeof msg.content === "string" && msg.content.trim() !== ""
      );
      const aiMessages = [
        { role: "system", content: newsSystemPrompt },
        ...sanitizedNewsHistory,
        { role: "user", content: message || "Summarize the latest news." },
      ];

      const encoder = new TextEncoder();
      const newsStream = new ReadableStream({
        async start(controller) {
          const sendEvent = (event: string, data: any) => {
            try { controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)); } catch {}
          };
          const keepalive = setInterval(() => sendEvent("ping", { ts: Date.now() }), 15000);

          try {
            const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${LOVABLE_API_KEY}` },
              body: JSON.stringify({ model: "google/gemini-2.5-flash", messages: aiMessages, stream: true }),
            });

            if (!response.ok) {
              sendEvent("error", { content: `AI error (${response.status})` });
              clearInterval(keepalive);
              controller.close();
              return;
            }

            let fullContent = "";
            const reader = response.body?.getReader();
            const decoder = new TextDecoder();
            let streamBuffer = "";

            if (reader) {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                streamBuffer += decoder.decode(value, { stream: true });
                let newlineIndex: number;
                while ((newlineIndex = streamBuffer.indexOf("\n")) !== -1) {
                  let line = streamBuffer.slice(0, newlineIndex);
                  streamBuffer = streamBuffer.slice(newlineIndex + 1);
                  if (line.endsWith("\r")) line = line.slice(0, -1);
                  if (!line.startsWith("data: ")) continue;
                  const jsonStr = line.slice(6).trim();
                  if (jsonStr === "[DONE]") break;
                  try {
                    const parsed = JSON.parse(jsonStr);
                    const delta = parsed.choices?.[0]?.delta?.content;
                    if (delta) { fullContent += delta; sendEvent("token", { token: delta }); }
                  } catch { streamBuffer = line + "\n" + streamBuffer; break; }
                }
              }
            }

            // Sanitize system-like disclaimers from the response
            const disclaimerPatterns = [
              /I don['']t have (?:access|real-time access) to[^.]*\./gi,
              /I(?:'m| am) unable to (?:access|retrieve|browse|verify)[^.]*\./gi,
              /I cannot (?:access|browse|retrieve|verify)[^.]*\./gi,
              /As an AI,? I (?:don['']t|cannot|can['']t)[^.]*\./gi,
              /I don['']t have the ability to[^.]*\./gi,
            ];
            let sanitizedContent = fullContent || "Unable to generate summary.";
            for (const pattern of disclaimerPatterns) {
              sanitizedContent = sanitizedContent.replace(pattern, "").trim();
            }
            sanitizedContent = sanitizedContent.replace(/\n{3,}/g, "\n\n").trim();

            sendEvent("content", { content: sanitizedContent });

            let traceId: string | null = null;
            try {
              const { data: traceData } = await supabaseService.from("agent_traces").insert({
                user_id: user.id, category: category || "News Summary", sub_category: subCategory || "News",
                thread_id: threadId || null,
                user_prompt: message, raw_llm_output: sanitizedContent, formatted_output: sanitizedContent,
                model_used: "google/gemini-2.5-flash", status: "completed",
                trace_type: "conversation", agent_source: agentSource,
                metadata: {
                  slide_summary_status: "pending",
                  slide_summary_model: "openai/gpt-5-nano",
                },
              }).select("id").single();
              traceId = traceData?.id || null;
            } catch (e) { console.error("News trace error:", e); }

            if (traceId) {
              // Build slide summaries INLINE before sending done — must complete before function exits
              try {
                const slideSummary = await buildSlideSummaryPayload(
                  sanitizedContent,
                  `${category || "News Summary"} ${subCategory || "News"}`.trim(),
                  LOVABLE_API_KEY,
                );
                const slideMetadata = slideSummary
                  ? {
                      slide_summary_status: "ready",
                      slide_summary_model: slideSummary.model,
                      slide_summary_version: slideSummary.version,
                      slide_summary_generated_at: slideSummary.generated_at,
                      slide_section_summaries: slideSummary.sections,
                      slide_summary_lookup: slideSummary.lookup,
                    }
                  : {
                      slide_summary_status: "failed",
                      slide_summary_model: "openai/gpt-5-nano",
                    };

                await supabaseService
                  .from("agent_traces")
                  .update({ metadata: slideMetadata })
                  .eq("id", traceId)
                  .eq("user_id", user.id);
              } catch (summaryErr) {
                console.error("News slide summary error:", summaryErr);
              }

              sendEvent("metadata", { traceId });
            }

            sendEvent("done", {});
          } catch (e) {
            console.error("News summary error:", e);
            sendEvent("error", { content: "Failed to generate summary." });
          } finally {
            clearInterval(keepalive);
            try { controller.close(); } catch {}
          }
        },
      });

      return new Response(newsStream, { headers: sseHeaders });
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const sendEvent = (event: string, data: any) => {
          try {
            controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
          } catch { /* stream closed */ }
        };

        const keepalive = setInterval(() => {
          sendEvent("ping", { ts: Date.now() });
        }, 15000);

        try {
          sendEvent("progress", { step: "Starting analysis..." });

          let webIntel = "";
          let mediaContext = "";

          // ===== OPTIMIZATION B + D: Try cache first, skip LLM router =====
          const doResearch = needsResearch(message, history);

          if (doResearch) {
            sendEvent("progress", { step: `Retrieving intelligence for ${allCompetitors.join(", ")}...` });

            const isFullProduct = category === "Full Product" && subCategory === "Full Product";

            // ===== STEP 0: Gallery-first media lookup =====
            // Check media_assets for existing media BEFORE any crawl
            sendEvent("progress", { step: "Checking media gallery for existing assets..." });
            const galleryResults = await Promise.all(
              allCompetitors.map(comp => getGalleryMedia(comp, category, subCategory))
            );

            // Gather intelligence for ALL competitors in parallel
            const allCachedResults = await Promise.all(
              allCompetitors.map(comp => getCachedIntelligence(comp, subCategory, category))
            );

            const allIntelParts: string[] = [];
            const allMediaParts: string[] = [];
            let anyHasCache = false;
            let anyMissingCache = false;

            // For multi-competitor queries, truncate intelligence to avoid oversized prompts
            const maxIntelPerComp = allCompetitors.length > 2 ? 1200 : allCompetitors.length > 1 ? 1800 : 3000;

            for (let ci = 0; ci < allCompetitors.length; ci++) {
              const cached = allCachedResults[ci];
              const comp = allCompetitors[ci];
              if (cached.hasCachedData) {
                anyHasCache = true;
                // Truncate each intelligence block for multi-competitor queries to prevent timeout
                const truncatedIntel = cached.intelligence.length > maxIntelPerComp
                  ? cached.intelligence.slice(0, maxIntelPerComp) + "\n[... truncated for prompt size]"
                  : cached.intelligence;
                allIntelParts.push(`\n=== INTELLIGENCE: ${comp} ===\n${truncatedIntel}`);
                // For gallery-only competitors, skip non-gallery cached media entirely
                // (it's just cached screenshots from docs that haven't been quality-checked)
                if (cached.media && !isGalleryOnlyCompetitor(comp)) {
                  allMediaParts.push(cached.media.replace(/--- AVAILABLE OFFICIAL MEDIA ---/g, `--- ${comp.toUpperCase()} MEDIA ---`).replace(/--- END MEDIA ---/g, `--- END ${comp.toUpperCase()} MEDIA ---`));
                } else if (cached.media && isGalleryOnlyCompetitor(comp)) {
                  console.log(`Skipping non-gallery cached media for gallery-only competitor "${comp}"`);
                }
              } else {
                anyMissingCache = true;
              }
            }

            // ===== STEP 1: Add gallery media + YouTube videos to context =====
            const allGalleryMediaLines: string[] = [];
            const allGalleryUrls = new Set<string>();
            for (let ci = 0; ci < allCompetitors.length; ci++) {
              const gallery = galleryResults[ci];
              for (const line of gallery.galleryMedia) allGalleryMediaLines.push(line);
              for (const url of gallery.galleryUrls) allGalleryUrls.add(url);
            }

            // Always search YouTube for ALL competitors (including gallery-only)
            sendEvent("progress", { step: "Searching YouTube for product videos..." });
            const youtubeResults = await Promise.all(
              allCompetitors.map(comp => searchYouTubeVideos(comp, category, subCategory))
            );
            const allYouTubeRefs: string[] = [];
            for (const refs of youtubeResults) {
              allYouTubeRefs.push(...refs);
            }
            if (allYouTubeRefs.length > 0) {
              allMediaParts.push(`--- YOUTUBE VIDEOS ---\n${allYouTubeRefs.join("\n")}\n--- END YOUTUBE VIDEOS ---`);
              console.log(`YouTube search: ${allYouTubeRefs.length} videos found across ${allCompetitors.length} competitors`);
            } else {
              console.log("YouTube search: no videos found for any competitor");
            }

            if (allGalleryMediaLines.length > 0) {
              allMediaParts.unshift(`--- GALLERY MEDIA (pre-verified) ---\n${allGalleryMediaLines.join("\n")}\n--- END GALLERY MEDIA ---`);
              toolCallsLog.push({ tool: "getGalleryMedia", totalGalleryAssets: allGalleryMediaLines.length });
              console.log(`Gallery media: ${allGalleryMediaLines.length} pre-verified assets added`);
            }

            // ===== STEP 2: Decide whether to crawl for new media =====
            const shouldCrawlMedia = await (async () => {
              const crawlDecisions: { comp: string; shouldCrawl: boolean; reason: string }[] = [];

              for (let ci = 0; ci < allCompetitors.length; ci++) {
                const comp = allCompetitors[ci];
                const gallery = galleryResults[ci];

                // Gallery-only competitors (OneStream, Anaplan, Planful, Oracle, SAP, Pigment):
                // Skip live crawl entirely — media is pre-crawled by daily scheduled-media-refresh
                if (isGalleryOnlyCompetitor(comp)) {
                  crawlDecisions.push({ comp, shouldCrawl: false, reason: `gallery-only competitor (${gallery.count} gallery assets)` });
                  continue;
                }

                if (isFullProduct) {
                  // Full Product threshold logic
                  const threshold = await handleFullProductMediaThreshold(comp, gallery);
                  if (threshold.skipCrawl) {
                    crawlDecisions.push({ comp, shouldCrawl: false, reason: `>8 gallery assets (${gallery.count})` });
                  } else {
                    crawlDecisions.push({ comp, shouldCrawl: true, reason: `${gallery.count} gallery assets, ${threshold.missingSubAreas.length} missing areas` });
                  }
                } else {
                  // Specific product area: crawl only if no gallery media exists for this intersection
                  if (gallery.count === 0) {
                    crawlDecisions.push({ comp, shouldCrawl: true, reason: "no gallery media for this product area" });
                  } else {
                    crawlDecisions.push({ comp, shouldCrawl: true, reason: `${gallery.count} gallery assets exist, checking for new non-CDN media` });
                  }
                }
              }

              for (const d of crawlDecisions) {
                console.log(`Crawl decision for "${d.comp}": ${d.shouldCrawl ? "CRAWL" : "SKIP"} — ${d.reason}`);
              }
              return crawlDecisions;
            })();

            // ===== STEP 3: Gather intelligence + selective media crawling =====
            if (anyHasCache && !anyMissingCache) {
              webIntel = allIntelParts.join("\n\n");
              mediaContext = allMediaParts.join("\n\n");
              toolCallsLog.push({ tool: "getCachedIntelligence", cached: true, competitors: allCompetitors.length });

              // Only crawl for competitors that need it
              const competitorsNeedingCrawl = shouldCrawlMedia.filter(d => d.shouldCrawl).map(d => d.comp);
              if (competitorsNeedingCrawl.length > 0) {
                sendEvent("progress", { step: `Crawling for ${subCategory} visuals (${competitorsNeedingCrawl.length} competitors)...` });
                const crawlResults = await Promise.all(
                  competitorsNeedingCrawl.map(comp => crawlForRelevantMedia(comp, category, subCategory))
                );
                for (const liveCrawl of crawlResults) {
                  if (liveCrawl.mediaRefs.length > 0) {
                    // Filter out URLs already in gallery to avoid duplicates
                    const newMediaRefs = liveCrawl.mediaRefs.filter(ref => {
                      const urlMatch = ref.match(/(https?:\/\/[^\s)]+)/);
                      if (!urlMatch) return true;
                      const normalizedUrl = urlMatch[1].replace(/\?.*$/, "");
                      return !allGalleryUrls.has(normalizedUrl);
                    });
                    if (newMediaRefs.length > 0) {
                      mediaContext += `\n--- LIVE CRAWL MEDIA (new) ---\n${newMediaRefs.join("\n")}\n--- END LIVE CRAWL MEDIA ---`;
                      console.log(`Live crawl found ${newMediaRefs.length} NEW media (${liveCrawl.mediaRefs.length - newMediaRefs.length} duplicates skipped)`);
                    }
                  }
                }
              } else {
                console.log("All competitors have sufficient gallery media — skipping live crawl");
              }

              sendEvent("progress", { step: "Intelligence loaded. Generating analysis..." });
            } else {
              sendEvent("progress", { step: "Gathering live competitive intelligence..." });
              const competitorsNeedingCrawl = shouldCrawlMedia.filter(d => d.shouldCrawl).map(d => d.comp);

              const liveResults = await Promise.all(
                allCompetitors.map(async (comp) => {
                  const needsCrawl = competitorsNeedingCrawl.includes(comp);
                  const [live, liveCrawl] = await Promise.all([
                    gatherLiveIntelligenceAndMedia(comp, subCategory, category),
                    needsCrawl ? crawlForRelevantMedia(comp, category, subCategory) : Promise.resolve({ mediaRefs: [], newPages: [] }),
                  ]);
                  return { comp, live, liveCrawl };
                })
              );

              for (const { comp, live, liveCrawl } of liveResults) {
                if (live.intelligence) allIntelParts.push(`\n=== INTELLIGENCE: ${comp} ===\n${live.intelligence}`);
                if (live.media) allMediaParts.push(live.media);
                if (liveCrawl.mediaRefs.length > 0) {
                  // Filter out gallery duplicates
                  const newMediaRefs = liveCrawl.mediaRefs.filter(ref => {
                    const urlMatch = ref.match(/(https?:\/\/[^\s)]+)/);
                    if (!urlMatch) return true;
                    return !allGalleryUrls.has(urlMatch[1].replace(/\?.*$/, ""));
                  });
                  if (newMediaRefs.length > 0) {
                    allMediaParts.push(`--- LIVE CRAWL MEDIA (new) ---\n${newMediaRefs.join("\n")}\n--- END LIVE CRAWL MEDIA ---`);
                  }
                }
              }

              webIntel = allIntelParts.join("\n\n");
              mediaContext = allMediaParts.join("\n\n");
              toolCallsLog.push({ tool: "gatherLiveIntelligenceAndMedia", cached: false, competitors: allCompetitors.length });
              sendEvent("progress", { step: "Intelligence gathered. Generating analysis..." });
            }

            if (webIntel) retrievedDocs.push({ source: "intel", length: webIntel.length });

            // ===== MEDIA QUALITY AGENT: AI-powered filtering =====
            // Gallery media is pre-verified (already passed quality gate), so only run quality agent
            // on NON-gallery media items. Gallery items pass through automatically.
            if (mediaContext) {
              sendEvent("progress", { step: "AI media quality agent evaluating visuals..." });
              try {
                // Split media context into gallery (pre-verified) and non-gallery (needs evaluation)
                const mediaLines = mediaContext.split("\n");
                const galleryLines: string[] = [];
                const nonGalleryLines: string[] = [];
                let inGalleryBlock = false;

                for (const line of mediaLines) {
                  if (line.includes("GALLERY MEDIA (pre-verified)")) { inGalleryBlock = true; continue; }
                  if (line.includes("END GALLERY MEDIA")) { inGalleryBlock = false; continue; }
                  if (line.startsWith("---")) { nonGalleryLines.push(line); continue; }
                  if (inGalleryBlock && line.trim()) {
                    galleryLines.push(line);
                  } else if (line.trim()) {
                    nonGalleryLines.push(line);
                  }
                }

                let finalMediaLines = [...galleryLines]; // gallery always passes through

                // Only run quality agent on non-gallery media
                const nonGalleryContext = nonGalleryLines.filter(l => !l.startsWith("---")).join("\n");
                if (nonGalleryContext.trim()) {
                  const primaryCompetitor = allCompetitors[0] || competitor;
                  const filteredResult = await filterMediaWithQualityAgent(
                    `--- NON-GALLERY MEDIA ---\n${nonGalleryContext}\n--- END ---`,
                    primaryCompetitor, category, subCategory
                  );
                  if (filteredResult) {
                    const seenFilteredUrls = new Set<string>(galleryLines.map(l => {
                      const m = l.match(/(https?:\/\/[^\s)]+)/);
                      return m ? m[1].replace(/\?.*$/, "") : "";
                    }).filter(Boolean));

                    for (const line of filteredResult.split("\n")) {
                      const urlMatch = line.match(/(https?:\/\/[^\s)]+)/);
                      if (urlMatch) {
                        const key = urlMatch[1].replace(/\?.*$/, "");
                        if (seenFilteredUrls.has(key)) continue;
                        seenFilteredUrls.add(key);
                      }
                      if (line.startsWith("---")) continue;
                      if (line.trim()) finalMediaLines.push(line);
                    }
                  }
                }

                // Also persist any newly approved non-gallery media to media_assets for future lookups
                // (fire-and-forget — don't block the response)
                if (finalMediaLines.length > galleryLines.length) {
                  const newApprovedCount = finalMediaLines.length - galleryLines.length;
                  console.log(`${newApprovedCount} new media items approved — will persist to gallery`);
                  persistNewMediaToGallery(
                    allCompetitors[0] || competitor, category, subCategory,
                    finalMediaLines.slice(galleryLines.length)
                  ).catch(e => console.error("persistNewMediaToGallery error:", e));
                }

                mediaContext = finalMediaLines.length > 0
                  ? `--- AVAILABLE OFFICIAL MEDIA (AI-verified, score ≥7) ---\n${finalMediaLines.join("\n")}\n--- END MEDIA ---`
                  : "";
                toolCallsLog.push({ tool: "mediaQualityAgent", galleryMedia: galleryLines.length, newApproved: finalMediaLines.length - galleryLines.length });
                console.log(`Media Quality Agent: ${galleryLines.length} gallery + ${finalMediaLines.length - galleryLines.length} new = ${finalMediaLines.length} total`);
              } catch (mqErr) {
                console.error("Media Quality Agent failed, using unfiltered media:", mqErr);
              }
            }
          }

          // ===== Intent detection: is this follow-up related to the analysis? =====
          const isRelatedFollowUp = isFollowUpRelatedToAnalysis(message, competitor, category, subCategory, history);
          const hasHistory = history && history.length > 0;
          const isIndependentQuestion = hasHistory && !isRelatedFollowUp;

          if (isIndependentQuestion) {
            console.log(`Intent detection: INDEPENDENT question detected — skipping heavy context injection`);
          }

          const isFullProduct = category === "Full Product" && subCategory === "Full Product";

          let systemPrompt: string;
          let modelUsed: string;

          if (isIndependentQuestion) {
            // Lightweight prompt for unrelated follow-ups — no intel/media/knowledge injection
            systemPrompt = `You are a knowledgeable assistant with expertise in enterprise software, FP&A, EPM, and business technology.

Answer the user's question directly and concisely. The conversation history provides context for what was discussed before, but the user's current question may be on a completely different topic — answer it on its own merits.

FORMATTING RULES:
- Use markdown for structure (## headers, bullet lists, tables where appropriate)
- Be factual and specific
- NEVER include system disclaimers or AI self-references
- NEVER fabricate URLs or image references
- NEVER expose internal adaptive planning data or proprietary information.`;
            modelUsed = "google/gemini-2.5-flash";
          } else {
            // Full competitive analysis prompt with all context
            const productAreaDesc = getProductAreaDescription(category, subCategory);
            const productAreaContext = productAreaDesc
              ? `\n\nPRODUCT AREA DEFINITION: "${subCategory}" in Workday Adaptive Planning means:\n"${productAreaDesc}"\n\nUse this definition to ensure your analysis focuses on capabilities that directly map to this product area.\n`
              : "";

            const isMultiCompetitor = allCompetitors.length > 1;
            const competitorNames = allCompetitors.join(", ");
            const competitorLabel = allCompetitors.join(" vs ");

            const fullProductSections = isFullProduct ? `
Always structure your initial analysis with these sections (use ## for section headers):

## Executive Summary
## Reporting & Analytics Comparison
## Modeling & Architecture Comparison
## Intelligent Planning & AI Comparison
## Integration & Data Connectivity
## Collaboration & Workflow
## Specialized Planning Modules
## Overall Strengths vs Weaknesses
## Reference Links` : `
Always structure your initial analysis with these sections (use ## for section headers):

## Feature Capability Comparison
## Implementation & Architecture Differences
## AI Capabilities
## Integration Methods
## Performance & Scale
## Strengths vs Weaknesses
## Reference Links`;

            const multiCompetitorInstructions = isMultiCompetitor ? `
MULTI-COMPETITOR ANALYSIS: You are comparing ${competitorNames} against Workday Adaptive Planning SIMULTANEOUSLY.
- All comparison tables MUST include a column for EACH competitor plus Workday Adaptive Planning
- In Strengths vs Weaknesses, provide ### sub-sections for EACH competitor AND Workday Adaptive Planning
- Highlight where competitors differentiate from EACH OTHER, not just from Workday
- Include a brief head-to-head summary at the end comparing the competitors against each other
` : "";

            const maxChunks = isFullProduct ? 15 : 6;
            const { context: retrievedKnowledge, chunks } = retrieveKnowledge(
              { category, subCategory, competitor, query: message },
              maxChunks
            );
            console.log(`Retrieved ${chunks.length} knowledge chunks`);

            // For follow-ups related to the analysis, include context but instruct to answer the specific question
            const followUpInstruction = hasHistory ? `

IMPORTANT: The user is asking a follow-up question. Answer their SPECIFIC question directly — do NOT regenerate the full structured analysis. Use the context below to inform your answer but keep the response focused and concise.` : "";

            systemPrompt = `You are a Competitive Intelligence Analyst specializing in enterprise FP&A and EPM software, with deep expertise in Workday Adaptive Planning.

Your role: Generate structured, factual competitive breakdowns comparing ${competitorLabel} against Workday Adaptive Planning${isFullProduct ? " as a complete product across all major capability areas" : ` in the ${subCategory} capability area (${category})`}.
${multiCompetitorInstructions}${productAreaContext}${followUpInstruction}

${retrievedKnowledge ? `--- WORKDAY ADAPTIVE PLANNING REFERENCE KNOWLEDGE ---\n${retrievedKnowledge}\n--- END REFERENCE KNOWLEDGE ---` : ""}

${webIntel ? `--- INTELLIGENCE BRIEF ---\n${webIntel}\n--- END BRIEF ---` : ""}
${!hasHistory ? fullProductSections : ""}

FORMATTING RULES (CRITICAL — follow precisely):
- Use markdown tables (with | delimiters) for comparisons
- Use ## for major section headers (e.g. "## Strengths vs Weaknesses", "## Executive Summary")
- Use ### for sub-section headers (e.g. "### Workday Adaptive Planning — Strengths", "### Planful — Potential Gaps")
- NEVER put section headers or sub-headers as bullet points. Headers MUST use ## or ### markdown syntax.
- A line like "CompanyName — SectionName" is ALWAYS a header, never a bullet point.
- Use plain text paragraphs for descriptions
- Use bullet lists (starting with -) ONLY for actual enumerated content items, never for section titles
- Always include full URLs as plain text so they can be hyperlinked
- Be factual. If you don't know something, state what is known and what requires further verification — never use phrases like "I don't have access" or "as an AI"
- NEVER include system disclaimers, AI self-references, or technical limitation notes. Convert any internal observations into user-facing insights.
- Avoid marketing language. Focus on technical and functional capabilities.
${!hasHistory ? `
RESPONSE STRUCTURE (MANDATORY — follow this exact order):
1. FIRST: Start with a "## Visual Overview" section containing ALL provided media
2. THEN: Executive Summary
3. THEN: Detailed comparison sections with tables
4. LAST: Reference Links

MEDIA REFERENCES:
${mediaContext || "No official media references were found for this query."}

MANDATORY media rules (CRITICAL — violations are treated as failures):
- You may ONLY use image/video URLs that appear in the MEDIA REFERENCES section above
- Do NOT fabricate, guess, or generate any image or video URLs under any circumstances
- Do NOT use YouTube thumbnail URLs, placeholder image services, or stock photo URLs
- Do NOT invent URLs based on patterns you've seen — if it's not listed above, don't use it
- Place ALL provided media items in "## Visual Overview" at the VERY START
- For images: ![Description](url)
- For videos: [VIDEO: Description](url)
- If no media references are provided above, skip the Visual Overview section entirely — do NOT create one with made-up URLs` : `
Do NOT include a Visual Overview section or any media/image references in follow-up responses unless specifically asked.`}

IMPORTANT: Never expose internal adaptive planning data or proprietary information.`;
            modelUsed = "openai/gpt-5";
          }

          const sanitizedHistory = (history || []).filter(
            (msg: any) => msg && typeof msg.content === "string" && msg.content.trim() !== ""
          );
          const aiMessages = [
            { role: "system", content: systemPrompt },
            ...sanitizedHistory,
            { role: "user", content: message || "Provide a comprehensive competitive analysis." },
          ];

          const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

          sendEvent("progress", { step: "AI model generating response..." });

          // ===== OPTIMIZATION F: Token streaming =====
          const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${LOVABLE_API_KEY}` },
            body: JSON.stringify({ model: modelUsed, messages: aiMessages, stream: true }),
          });

          if (!response.ok) {
            const errText = await response.text();
            console.error("AI gateway error:", response.status, errText);

            const latencyMs = Date.now() - traceStartTime;
            supabaseService.from("agent_traces").insert({
              user_id: user.id, thread_id: threadId || null, category, sub_category: subCategory,
              competitor_name: competitor, system_prompt: systemPrompt, user_prompt: message,
              retrieved_documents: retrievedDocs, tool_calls: toolCallsLog,
              model_used: modelUsed, status: "error", error_message: `AI gateway error: ${response.status}`,
              latency_ms: latencyMs, trace_type: 'conversation',
            }).then(() => {}).catch(() => {});

            if (response.status === 429) {
              sendEvent("error", { content: "Rate limit exceeded. Please try again in a moment." });
            } else if (response.status === 402) {
              sendEvent("error", { content: "Usage credits exhausted. Please add credits." });
            } else {
              sendEvent("error", { content: `AI gateway error (${response.status}). Please try again.` });
            }
            clearInterval(keepalive);
            controller.close();
            return;
          }

          // Stream tokens to client
          let fullContent = "";
          let usage: any = {};
          const reader = response.body?.getReader();
          const decoder = new TextDecoder();
          let streamBuffer = "";

          if (reader) {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              streamBuffer += decoder.decode(value, { stream: true });

              let newlineIndex: number;
              while ((newlineIndex = streamBuffer.indexOf("\n")) !== -1) {
                let line = streamBuffer.slice(0, newlineIndex);
                streamBuffer = streamBuffer.slice(newlineIndex + 1);

                if (line.endsWith("\r")) line = line.slice(0, -1);
                if (!line.startsWith("data: ")) continue;

                const jsonStr = line.slice(6).trim();
                if (jsonStr === "[DONE]") break;

                try {
                  const parsed = JSON.parse(jsonStr);
                  const delta = parsed.choices?.[0]?.delta?.content;
                  if (delta) {
                    fullContent += delta;
                    sendEvent("token", { token: delta });
                  }
                  if (parsed.usage) usage = parsed.usage;
                } catch {
                  // incomplete JSON, put back
                  streamBuffer = line + "\n" + streamBuffer;
                  break;
                }
              }
            }
          }

          // Flush remaining buffer
          if (streamBuffer.trim()) {
            for (let raw of streamBuffer.split("\n")) {
              if (!raw) continue;
              if (raw.endsWith("\r")) raw = raw.slice(0, -1);
              if (!raw.startsWith("data: ")) continue;
              const jsonStr = raw.slice(6).trim();
              if (jsonStr === "[DONE]") continue;
              try {
                const parsed = JSON.parse(jsonStr);
                const delta = parsed.choices?.[0]?.delta?.content;
                if (delta) {
                  fullContent += delta;
                  sendEvent("token", { token: delta });
                }
                if (parsed.usage) usage = parsed.usage;
              } catch { /* ignore */ }
            }
          }

          let content = fullContent || "Unable to generate analysis. Please try again.";

          // ===== Sanitize system-like disclaimers from the response =====
          const disclaimerPatterns = [
            /I don['']t have (?:access|real-time access) to[^.]*\./gi,
            /I(?:'m| am) unable to (?:access|retrieve|browse|verify)[^.]*\./gi,
            /I cannot (?:access|browse|retrieve|verify)[^.]*\./gi,
            /As an AI,? I (?:don['']t|cannot|can['']t)[^.]*\./gi,
            /I don['']t have the ability to[^.]*\./gi,
            /(?:Please )?note(?::| that) (?:I am|I'm|this is) (?:an? )?(?:AI|language model|assistant)[^.]*\./gi,
            /(?:As )?(?:an? )?(?:AI|language model),? I[^.]*\./gi,
            /I should (?:note|mention|point out|clarify) that[^.]*(?:AI|model|assistant|limitation|access|real-time)[^.]*\./gi,
            /\*\*(?:Note|Disclaimer|Important Note)\*\*:?\s*[^.]*(?:AI|model|access|limitation|verify|real-time)[^.]*\./gi,
            /⚠️[^.]*(?:AI|access|limitation|disclaimer)[^.]*\./gi,
            /\[(?:Note|System|Internal)\]:?\s*[^.]*\./gi,
          ];
          for (const pattern of disclaimerPatterns) {
            content = content.replace(pattern, "").trim();
          }

          // ===== ANTI-FABRICATION GUARD =====
          // Build a whitelist of allowed media URLs from the media context
          const allowedMediaUrls = new Set<string>();
          if (mediaContext) {
            for (const match of mediaContext.matchAll(/https?:\/\/[^\s)]+/g)) {
              allowedMediaUrls.add(match[0].replace(/\?.*$/, ""));
            }
          }

          // Strip any image markdown that references URLs NOT in the whitelist
          // This catches LLM-fabricated YouTube thumbnails, stock photos, etc.
          content = content.replace(/!\[[^\]]*\]\((https?:\/\/[^)]+)\)/g, (match, url) => {
            const normalizedUrl = url.replace(/\?.*$/, "");
            if (allowedMediaUrls.has(normalizedUrl)) return match; // keep verified
            // Check if it's a sub-path match (e.g. storage bucket URLs)
            for (const allowed of allowedMediaUrls) {
              if (normalizedUrl.startsWith(allowed) || allowed.startsWith(normalizedUrl)) return match;
            }
            console.log(`[anti-fabrication] Stripped fabricated image URL: ${url}`);
            return ""; // remove fabricated image
          });

          // Also strip fabricated video links not in whitelist
          content = content.replace(/\[VIDEO:[^\]]*\]\((https?:\/\/[^)]+)\)/g, (match, url) => {
            const normalizedUrl = url.replace(/\?.*$/, "");
            if (allowedMediaUrls.has(normalizedUrl)) return match;
            for (const allowed of allowedMediaUrls) {
              if (normalizedUrl.startsWith(allowed) || allowed.startsWith(normalizedUrl)) return match;
            }
            console.log(`[anti-fabrication] Stripped fabricated video URL: ${url}`);
            return "";
          });

          content = content.replace(/\n{3,}/g, '\n\n').trim();

          // Post-processing: ensure verified media URLs render properly
          if (mediaContext) {
            const mediaUrls = [...mediaContext.matchAll(/https?:\/\/[^\s)]+/g)].map(m => m[0]);
            const mediaLines = mediaContext.split("\n");

            const allMediaTokens: string[] = [];
            const seenUrls = new Set<string>();
            for (const url of mediaUrls) {
              const isImageUrl = /\.(?:png|jpe?g|gif|webp|svg)(?:\?|$)/i.test(url) || url.includes("competitor-screenshots");
              const isVideo = !isImageUrl && (
                url.includes("youtube.com/watch") || url.includes("youtu.be/") ||
                url.includes("vimeo.com/") || url.includes("wistia.com/") ||
                url.includes("vidyard.com/") || url.includes("loom.com/") ||
                /\.(?:mp4|webm|mov|ogg)(?:\?|$)/i.test(url)
              );
              if (!isImageUrl && !isVideo) continue;
              const dedupeKey = url.replace(/\?.*$/, "");
              if (seenUrls.has(dedupeKey)) continue;
              seenUrls.add(dedupeKey);
              const refLine = mediaLines.find(l => l.includes(url));
              let desc = refLine ? refLine.replace(/\[.*?\]\s*/, "").replace(url, "").replace(/[:\s]+$/, "").trim() : "";
              // Extract source page URL from (from URL) pattern
              const fromMatch = desc.match(/\(from\s+(https?:\/\/[^)]+)\)/);
              const sourcePageUrl = fromMatch ? fromMatch[1] : "";
              desc = desc.replace(/\(from[^)]*\)/g, "").trim();
              desc = desc || `${competitor} product`;
              // Embed source page URL in markdown title attribute for frontend parsing
              const token = isVideo
                ? `[VIDEO: ${desc}](${url})`
                : sourcePageUrl
                  ? `![${desc}](${url} "${sourcePageUrl}")`
                  : `![${desc}](${url})`;
              allMediaTokens.push(token);
            }

            allMediaTokens.sort((a, b) => {
              const aIsCrawled = a.includes("competitor-screenshots") ? 0 : 1;
              const bIsCrawled = b.includes("competitor-screenshots") ? 0 : 1;
              return aIsCrawled - bIsCrawled;
            });

            if (allMediaTokens.length > 0) {
              content = content.replace(/## Visual Overview\s*\n[\s\S]*?(?=\n## )/, '').trim();
              for (const url of mediaUrls) {
                const escapedUrl = url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                content = content.replace(new RegExp(`!\\[[^\\]]*\\]\\(${escapedUrl}\\)`, 'g'), '');
                content = content.replace(new RegExp(escapedUrl, 'g'), '');
              }
              content = content.replace(/\n{3,}/g, '\n\n').trim();
              content = `## Visual Overview\n\n${allMediaTokens.join("\n\n")}\n\n${content}`;
            }
          }

          // Send final processed content
          sendEvent("content", { content });

          const latencyMs = Date.now() - traceStartTime;

          let traceId: string | null = null;
          try {
            const { data: traceData } = await supabaseService.from("agent_traces").insert({
              user_id: user.id, thread_id: threadId || null, category, sub_category: subCategory,
              competitor_name: competitor, system_prompt: systemPrompt, user_prompt: message,
              retrieved_documents: retrievedDocs, tool_calls: toolCallsLog,
              raw_llm_output: content, formatted_output: content,
              model_used: modelUsed,
              latency_ms: latencyMs, prompt_tokens: usage.prompt_tokens || null,
              completion_tokens: usage.completion_tokens || null, total_tokens: usage.total_tokens || null,
              status: "completed", trace_type: "conversation", agent_source: "comp_agent",
              metadata: {
                slide_summary_status: "pending",
                slide_summary_model: "openai/gpt-5-nano",
              },
            }).select("id").single();
            traceId = traceData?.id || null;
          } catch (traceInsertErr) {
            console.error("Trace insert error:", traceInsertErr);
          }

          // Run eval + slide summary in parallel, await BOTH before sending done
          const evalPromise = evaluateResponse(content, competitor, subCategory)
            .catch((e) => {
              console.error("Evaluation error:", e);
              return null;
            });

          const slideSummaryPromise = LOVABLE_API_KEY
            ? buildSlideSummaryPayload(
                content,
                `${category || ""} ${subCategory || ""} ${competitor || ""}`.trim(),
                LOVABLE_API_KEY,
              ).catch((e) => {
                console.error("Slide summary generation error:", e);
                return null;
              })
            : Promise.resolve<SlideSummaryPayload | null>(null);

          // Await both with a generous timeout — must complete before function exits
          const [evalResult, slideSummary] = await Promise.all([
            Promise.race([
              evalPromise,
              new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000)),
            ]),
            Promise.race([
              slideSummaryPromise,
              new Promise<null>((resolve) => setTimeout(() => resolve(null), 15000)),
            ]),
          ]);

          if (traceId) {
            const judgeScores = evalResult ? {
              factual_correctness: evalResult.factual_correctness,
              structural_clarity: evalResult.structural_clarity,
              depth_of_comparison: evalResult.depth_of_comparison,
              visual_evidence: evalResult.visual_evidence,
              citation_coverage: evalResult.citation_coverage,
              actionability: evalResult.actionability,
              media_quality: evalResult.media_quality,
              overall_summary: evalResult.overall_summary,
              improvement_suggestions: evalResult.improvement_suggestions,
            } : {};

            const slideMetadata = slideSummary
              ? {
                  slide_summary_status: "ready",
                  slide_summary_model: slideSummary.model,
                  slide_summary_version: slideSummary.version,
                  slide_summary_generated_at: slideSummary.generated_at,
                  slide_section_summaries: slideSummary.sections,
                  slide_summary_lookup: slideSummary.lookup,
                }
              : {
                  slide_summary_status: "failed",
                  slide_summary_model: "openai/gpt-5-nano",
                };

            try {
              await supabaseService.from("agent_traces").update({
                judge_scores: judgeScores,
                overall_score: evalResult?.overall_score || null,
                metadata: slideMetadata,
              }).eq("id", traceId).eq("user_id", user.id);
            } catch (updateErr) {
              console.error("Trace update error:", updateErr);
            }
          }

          sendEvent("metadata", {
            evalScores: evalResult,
            traceId,
          });

          sendEvent("done", {});
        } catch (innerErr) {
          console.error("Stream error:", innerErr);
          try {
            const errEvent = `event: error\ndata: ${JSON.stringify({ content: "An error occurred processing your request." })}\n\n`;
            controller.enqueue(encoder.encode(errEvent));
          } catch { /* closed */ }

          try {
            supabaseService.from("agent_traces").insert({
              user_id: user.id, category: "unknown", sub_category: "unknown",
                      status: "error", error_message: String(innerErr),
                      latency_ms: Date.now() - traceStartTime,
                      tool_calls: toolCallsLog, retrieved_documents: retrievedDocs,
                      trace_type: 'conversation', agent_source: 'comp_agent',
            }).then(() => {}).catch(() => {});
          } catch { /* swallow */ }
        } finally {
          clearInterval(keepalive);
          try { controller.close(); } catch { /* already closed */ }
        }
      },
    });

    return new Response(stream, { headers: sseHeaders });
  } catch (error) {
    console.error("Chat analysis error:", error);
    return new Response(JSON.stringify({ error: "An error occurred processing your request." }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
