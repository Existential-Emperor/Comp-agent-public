import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { firecrawlFetch, hasFirecrawlKey } from "../_shared/firecrawl-keys.ts";
import { monitoredFetch } from "../_shared/monitored-fetch.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const COMPETITOR_NAMES = [
  "Anaplan", "Planful", "Vena Solutions", "Pigment", "Datarails",
  "Jedox", "Board International", "OneStream", "Prophix", "Workiva",
  "Oracle EPM", "SAP Analytics Cloud", "IBM Planning Analytics",
  "Wolters Kluwer CCH Tagetik", "Workday Adaptive Planning",
];
const COMPETITOR_NAMES_LOWER = COMPETITOR_NAMES.map((c) => c.toLowerCase());

const SOCIAL_DOMAINS = [
  "reddit.com", "linkedin.com", "twitter.com", "x.com",
  "facebook.com", "youtube.com", "quora.com",
];

const PRODUCT_UPDATE_KEYWORDS = [
  "launch", "release", "announce", "new feature", "update", "upgrade",
  "integration", "partnership", "acquisition", "funding", "raised",
  "ai ", "artificial intelligence", "platform", "module", "version",
  "roadmap", "generally available", "ga ", "beta", "preview",
  "pricing", "rebrand", "merger", "ipo", "product", "capability",
  "enhancement", "introduced", "unveil", "expand",
];

function mentionsCompetitor(title: string, content: string | undefined): boolean {
  const text = `${title} ${content || ""}`.toLowerCase();
  return COMPETITOR_NAMES_LOWER.some((name) => text.includes(name));
}

function isProductRelevant(title: string, content: string | undefined): boolean {
  const text = `${title} ${content || ""}`.toLowerCase();
  return PRODUCT_UPDATE_KEYWORDS.some((kw) => text.includes(kw));
}

function isIrrelevantUrl(url: string): boolean {
  const lower = url.toLowerCase();
  if (lower.includes("/careers") || lower.includes("/jobs")) return true;
  if (lower.includes("remote-work-statistics")) return true;
  if (lower.includes("/about/newsroom") && !lower.includes("product")) return true;
  return false;
}

// Detect official competitor social media pages (not user/community posts)
const OFFICIAL_SLUGS = [
  "anaplan", "planful", "pigment", "datarails", "jedox", "onestream", "prophix",
  "workiva", "oracle", "sap", "ibm", "board-international", "boardinternational",
  "vena-solutions", "venasolutions", "wolters-kluwer", "cch-tagetik", "workday",
  "onesoftware", "prophixsoftware", "jedoxag",
];

function isOfficialCompetitorSocial(url: string): boolean {
  try {
    const lower = url.toLowerCase();
    const urlObj = new URL(lower);
    const host = urlObj.hostname;
    const path = urlObj.pathname;

    if (host.includes("linkedin.com") && path.includes("/company/")) {
      return OFFICIAL_SLUGS.some((slug) => path.includes(`/company/${slug}`));
    }
    if (host.includes("youtube.com") && (path.startsWith("/@") || path.startsWith("/c/") || path.startsWith("/channel/"))) {
      return OFFICIAL_SLUGS.some((slug) => path.includes(slug));
    }
    if (host.includes("twitter.com") || host.includes("x.com")) {
      const handle = path.split("/")[1]?.toLowerCase() || "";
      return OFFICIAL_SLUGS.some((slug) => handle.includes(slug));
    }
    return false;
  } catch { return false; }
}

function hostMatchesDomain(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

function isSocialMedia(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return SOCIAL_DOMAINS.some((d) => hostMatchesDomain(host, d));
  } catch {
    return false;
  }
}

// Short aliases for fuzzy matching competitor names
const COMPETITOR_ALIASES: Record<string, string> = {
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

function detectCompetitorName(title: string, content: string | undefined): string {
  const text = `${title} ${content || ""}`.toLowerCase();
  // Check exact names first
  for (let i = 0; i < COMPETITOR_NAMES_LOWER.length; i++) {
    if (text.includes(COMPETITOR_NAMES_LOWER[i])) return COMPETITOR_NAMES[i];
  }
  // Check aliases
  for (const [alias, name] of Object.entries(COMPETITOR_ALIASES)) {
    if (text.includes(alias)) return name;
  }
  return "Other";
}

function getSourceLabel(url: string): string {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host.includes("reddit.com")) return "Reddit";
    if (host.includes("linkedin.com")) return "LinkedIn";
    if (host.includes("twitter.com") || host.includes("x.com")) return "X/Twitter";
    if (host.includes("youtube.com")) return "YouTube";
    if (host.includes("quora.com")) return "Quora";
    if (host.includes("facebook.com")) return "Facebook";
    return host.replace("www.", "");
  } catch {
    return "Unknown";
  }
}

// Track whether Tavily is exhausted across queries in a single invocation
let tavilyExhausted = false;

async function claudeWebSearch(query: string, maxResults = 10): Promise<{ results: any[]; images: string[] }> {
  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!anthropicKey) {
    console.error("Claude fallback: ANTHROPIC_API_KEY not set");
    return { results: [], images: [] };
  }

  console.log(`Claude fallback search: ${query}`);
  const res = await monitoredFetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": anthropicKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: maxResults }],
      messages: [{ role: "user", content: `Search the web for: ${query}. Return all relevant results with titles, URLs, and summaries.` }],
    }),
  }, { keyName: "ANTHROPIC_API_KEY", service: "anthropic", edgeFunction: "fetch-news" });

  if (!res.ok) {
    const errText = await res.text();
    console.error(`Claude fallback error: ${res.status} ${errText.slice(0, 200)}`);
    return { results: [], images: [] };
  }

  const data = await res.json();
  const results: any[] = [];

  for (const block of data.content || []) {
    if (block.type === "web_search_tool_result") {
      for (const sr of block.content || []) {
        if (sr.type === "web_search_result") {
          results.push({
            title: sr.title || "",
            url: sr.url || "",
            content: sr.page_content || sr.encrypted_content || "",
          });
        }
      }
    }
  }

  return { results, images: [] };
}

async function tavilySearch(apiKey: string, query: string, days = 30, topicOverride?: string) {
  // If Tavily already failed in this invocation, go straight to Claude
  if (tavilyExhausted) {
    return claudeWebSearch(query, 10);
  }

  const body: Record<string, any> = {
    api_key: apiKey,
    query,
    max_results: 10,
    search_depth: "advanced",
    include_images: true,
    include_image_descriptions: false,
    days,
  };
  // Use topic "general" for community/social queries to get broader results
  if (topicOverride) body.topic = topicOverride;

  const res = await monitoredFetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }, { keyName: "TAVILY_API_KEY", service: "tavily", edgeFunction: "fetch-news" });

  // If Tavily is exhausted or rate-limited, fall back to Claude
  if (res.status === 402 || res.status === 429 || res.status === 432) {
    await res.text(); // consume body
    console.log(`Tavily returned ${res.status} — switching to Claude web search fallback`);
    tavilyExhausted = true;
    return claudeWebSearch(query, 10);
  }

  const data = await res.json();
  return { results: data.results || [], images: data.images || [] };
}

// Extract date from Reddit URL pattern /comments/XXXXX/ using Reddit's base36 timestamp
function extractRedditDate(url: string): string | null {
  try {
    const match = url.match(/\/comments\/([a-z0-9]+)\//i);
    if (!match) return null;
    // Reddit post IDs are base36-encoded, but the ID itself doesn't directly encode time
    // Instead, we can try to get the date from the Reddit JSON API
    return null;
  } catch { return null; }
}

// Upload image bytes to storage, return public URL
async function uploadNewsThumbnail(
  supabase: ReturnType<typeof createClient>,
  bytes: Uint8Array,
  contentType: string,
  sourceUrl: string,
): Promise<string | null> {
  const ext = contentType.includes("jpeg") ? "jpg" : contentType.includes("webp") ? "webp" : contentType.includes("gif") ? "gif" : "png";
  const urlSlug = sourceUrl.replace(/https?:\/\//, "").replace(/[^a-z0-9]/gi, "-").slice(0, 40);
  const filePath = `news-thumbnails/${Date.now()}-${urlSlug}-${crypto.randomUUID()}.${ext}`;

  const { error: uploadErr } = await supabase.storage
    .from("competitor-screenshots")
    .upload(filePath, bytes, { contentType, upsert: true });

  if (uploadErr) return null;
  const { data } = supabase.storage.from("competitor-screenshots").getPublicUrl(filePath);
  return data?.publicUrl || null;
}

const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

function parseDateLoose(input?: string | null): string | null {
  if (!input) return null;
  const d = new Date(input);
  if (!isNaN(d.getTime())) return d.toISOString();

  const text = input.toLowerCase();
  const monthYear = text.match(new RegExp(`(${MONTHS.join("|")})\\s+(20\\d{2})`, "i"));
  if (monthYear) {
    const monthIdx = MONTHS.indexOf(monthYear[1].toLowerCase());
    const year = Number(monthYear[2]);
    if (monthIdx >= 0 && year >= 2000 && year <= 2100) {
      return new Date(Date.UTC(year, monthIdx, 1)).toISOString();
    }
  }

  const yearOnly = text.match(/(?:released|release|update|updates|in)\s+(20\d{2})/i) || text.match(/\b(20\d{2})\b/);
  if (yearOnly) {
    const year = Number(yearOnly[1]);
    if (year >= 2000 && year <= 2100) {
      return new Date(Date.UTC(year, 0, 1)).toISOString();
    }
  }

  return null;
}

function shouldPreferScreenshot(url: string): boolean {
  const lower = url.toLowerCase();
  return (
    lower.includes("community.") ||
    lower.includes("/discussion/") ||
    lower.includes("/categories/") ||
    lower.includes("/forum/")
  );
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/");
}

function extractMetaContent(html: string, key: string): string | null {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${escaped}["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+name=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${escaped}["'][^>]*>`, "i"),
  ];
  for (const regex of patterns) {
    const match = html.match(regex);
    if (match?.[1]) return decodeHtmlEntities(match[1].trim());
  }
  return null;
}

async function scrapeArticleMetaDirect(url: string): Promise<{ imageUrl: string | null; publishedAt: string | null }> {
  const result = { imageUrl: null as string | null, publishedAt: null as string | null };
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml",
      },
      redirect: "follow",
    });

    if (!res.ok) return result;
    const html = await res.text();

    const dateCandidates = [
      extractMetaContent(html, "article:published_time"),
      extractMetaContent(html, "article:modified_time"),
      extractMetaContent(html, "datePublished"),
      extractMetaContent(html, "publish_date"),
      extractMetaContent(html, "pubdate"),
      extractMetaContent(html, "dc.date"),
      extractMetaContent(html, "date"),
      url,
    ];

    for (const candidate of dateCandidates) {
      const parsed = parseDateLoose(candidate);
      if (parsed) {
        result.publishedAt = parsed;
        break;
      }
    }

    const imageCandidates = [
      extractMetaContent(html, "og:image:secure_url"),
      extractMetaContent(html, "og:image"),
      extractMetaContent(html, "twitter:image"),
      extractMetaContent(html, "image"),
    ];

    for (const candidate of imageCandidates) {
      if (!candidate) continue;
      try {
        const absolute = new URL(candidate, url).toString();
        const lower = absolute.toLowerCase();
        if (/(icon|favicon|logo|avatar|badge|sprite|author|profile|headshot|chunkicon|thumbsup|thumbs-up)/i.test(lower)) continue;
        if (/\/icons?\//i.test(lower)) continue;
        if (/\.svg(\?|$)/i.test(lower)) continue;
        result.imageUrl = absolute;
        break;
      } catch {
        continue;
      }
    }

    if (!result.imageUrl) {
      const inlineFromHtml = extractInlineImageUrls(html, url);
      for (const candidate of inlineFromHtml.slice(0, 6)) {
        const lower = candidate.toLowerCase();
        if (/\b(icon|favicon|logo|avatar|badge|sprite|author|profile|headshot)\b/i.test(lower)) continue;
        if (/\.svg(\?|$)/i.test(lower)) continue;
        result.imageUrl = candidate;
        break;
      }
    }

    return result;
  } catch {
    return result;
  }
}

async function uploadScreenshotFromPageData(
  pageData: any,
  supabase: ReturnType<typeof createClient>,
  sourceUrl: string,
): Promise<string | null> {
  // Firecrawl can return screenshot in multiple fields
  const screenshot = pageData?.screenshot || pageData?.screenshot_url || pageData?.screenshotUrl;
  if (!screenshot) {
    console.log(`No screenshot field found in page data for ${sourceUrl}. Keys: ${Object.keys(pageData || {}).join(", ")}`);
    return null;
  }

  console.log(`Screenshot type: ${typeof screenshot}, starts with: ${String(screenshot).substring(0, 50)}`);

  if (typeof screenshot === "string" && screenshot.startsWith("http")) {
    try {
      const ssRes = await fetch(screenshot);
      if (!ssRes.ok) { console.log(`Screenshot URL fetch failed: ${ssRes.status}`); return null; }
      const ssBytes = new Uint8Array(await ssRes.arrayBuffer());
      console.log(`Screenshot URL bytes: ${ssBytes.length}`);
      if (ssBytes.length < 500) return null;
      return uploadNewsThumbnail(supabase, ssBytes, ssRes.headers.get("content-type") || "image/png", sourceUrl);
    } catch (e) { console.error("Screenshot URL download error:", e); return null; }
  }

  if (typeof screenshot === "string" && screenshot.length > 100) {
    try {
      const base64Part = screenshot.startsWith("data:image/") ? screenshot.split(",")[1] : screenshot;
      if (!base64Part) return null;
      const binary = atob(base64Part);
      const ssBytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) ssBytes[i] = binary.charCodeAt(i);
      console.log(`Screenshot base64 bytes: ${ssBytes.length}`);
      if (ssBytes.length < 500) return null;
      return uploadNewsThumbnail(supabase, ssBytes, "image/png", sourceUrl);
    } catch (e) { console.error("Screenshot base64 decode error:", e); return null; }
  }

  return null;
}

// Scrape a page with Firecrawl and extract: image URL + published date
// Dedicated screenshot-only scrape as last resort
async function takeScreenshotFallback(
  _firecrawlKey: string,
  url: string,
  supabase: ReturnType<typeof createClient>,
): Promise<string | null> {
  try {
    console.log(`Screenshot fallback for: ${url}`);
    const res = await firecrawlFetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      body: JSON.stringify({
        url,
        formats: ["screenshot"],
        onlyMainContent: false,
        waitFor: 3000,
      }),
    });
    if (!res.ok) {
      const errorBody = await res.text().catch(() => "");
      if (res.status === 402) {
        console.log(`Screenshot fallback skipped (Firecrawl credits): ${url}`);
        return null;
      }
      console.log(`Screenshot fallback API response: ${res.status} ${errorBody.slice(0, 180)}`);
      return null;
    }
    const data = await res.json();
    const pageData = data?.data || data || {};
    console.log(`Screenshot fallback keys: ${Object.keys(pageData).join(", ")}`);
    return await uploadScreenshotFromPageData(pageData, supabase, url);
  } catch (e) {
    console.error("Screenshot fallback error:", e);
    return null;
  }
}

function isSocialUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return ["linkedin.com", "reddit.com", "twitter.com", "x.com", "facebook.com", "youtube.com", "quora.com"]
      .some((d) => hostMatchesDomain(host, d));
  } catch { return false; }
}

async function scrapeArticleMeta(
  _firecrawlKey: string,
  url: string,
  supabase: ReturnType<typeof createClient>,
  titleHint?: string,
): Promise<{ imageUrl: string | null; publishedAt: string | null }> {
  const result = { imageUrl: null as string | null, publishedAt: null as string | null };

  // Social URLs (LinkedIn, Reddit, etc.) block scraping — skip Firecrawl entirely, just try direct meta
  if (isSocialUrl(url)) {
    console.log(`Skipping Firecrawl for social URL: ${url}`);
    const fallbackMeta = await scrapeArticleMetaDirect(url);
    result.imageUrl = fallbackMeta.imageUrl;
    result.publishedAt = fallbackMeta.publishedAt;
    return result;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const res = await firecrawlFetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      body: JSON.stringify({
        url,
        formats: ["markdown", "html", "screenshot"],
        onlyMainContent: false,
        waitFor: 2500,
      }),
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      const errorBody = await res.text().catch(() => "");
      if (res.status === 402) {
        console.log(`Primary scrape skipped (Firecrawl credits): ${url}`);
      } else {
        console.log(`Primary scrape failed for ${url}: ${res.status} ${errorBody.slice(0, 180)}`);
      }
      const fallbackMeta = await scrapeArticleMetaDirect(url);
      result.imageUrl = fallbackMeta.imageUrl;
      result.publishedAt = fallbackMeta.publishedAt;
      // If still no image and this wasn't a credit issue, try screenshot fallback
      if (!result.imageUrl && res.status !== 402) {
        result.imageUrl = await takeScreenshotFallback(firecrawlKey, url, supabase);
      }
      return result;
    }

    const data = await res.json();
    const pageData = data?.data || data || {};
    const metadata = pageData.metadata || {};

    // Date extraction (metadata -> title/url fallback)
    const dateCandidates = [
      metadata.publishedTime,
      metadata.published_time,
      metadata["article:published_time"],
      metadata.datePublished,
      metadata.date,
      metadata.publishDate,
      titleHint,
      metadata.title,
      url,
    ];
    for (const candidate of dateCandidates) {
      const parsed = parseDateLoose(typeof candidate === "string" ? candidate : null);
      if (parsed) {
        result.publishedAt = parsed;
        break;
      }
    }

    // Prefer screenshot for community/forum style pages to avoid irrelevant avatars/headshots
    if (shouldPreferScreenshot(url)) {
      result.imageUrl = await uploadScreenshotFromPageData(pageData, supabase, url);
      if (!result.imageUrl) {
        const fallbackMeta = await scrapeArticleMetaDirect(url);
        result.imageUrl = fallbackMeta.imageUrl;
        result.publishedAt = result.publishedAt || fallbackMeta.publishedAt;
      }
      if (!result.imageUrl) {
        result.imageUrl = await takeScreenshotFallback(firecrawlKey, url, supabase);
      }
      return result;
    }

    // Otherwise try inline/OG first
    const combinedContent = `${pageData.markdown || ""}\n${pageData.html || ""}`;
    const inlineImages = extractInlineImageUrls(combinedContent, url);

    const candidateUrls = [
      ...inlineImages,
      metadata.ogImage, metadata.og_image, metadata["og:image"],
      metadata.twitterImage, metadata.twitter_image, metadata["twitter:image"],
    ].filter((u): u is string => typeof u === "string" && u.length > 10);

    for (const candidate of candidateUrls.slice(0, 8)) {
      try {
        const imgRes = await fetch(candidate, {
          headers: { "User-Agent": "Mozilla/5.0", "Referer": url },
          redirect: "follow",
        });
        if (!imgRes.ok) continue;
        const ct = imgRes.headers.get("content-type") || "";
        if (!ct.startsWith("image/")) continue;
        const bytes = new Uint8Array(await imgRes.arrayBuffer());
        if (bytes.length < 5000) continue;
        const lower = candidate.toLowerCase();
        if (/(icon|favicon|logo|avatar|badge|sprite|author|profile|headshot|chunkicon|thumbsup|thumbs-up)/i.test(lower)) continue;
        if (/\/icons?\//i.test(lower)) continue;
        if (/\.svg(\?|$)/i.test(lower)) continue;

        const uploaded = await uploadNewsThumbnail(supabase, bytes, ct, url);
        if (uploaded) {
          result.imageUrl = uploaded;
          break;
        }
      } catch {
        continue;
      }
    }

    // Try the page screenshot from the initial scrape
    if (!result.imageUrl) {
      result.imageUrl = await uploadScreenshotFromPageData(pageData, supabase, url);
    }

    // Try direct meta scrape
    if (!result.imageUrl || !result.publishedAt) {
      const fallbackMeta = await scrapeArticleMetaDirect(url);
      if (!result.imageUrl) result.imageUrl = fallbackMeta.imageUrl;
      if (!result.publishedAt) result.publishedAt = fallbackMeta.publishedAt;
    }

    // LAST RESORT: dedicated screenshot-only scrape
    if (!result.imageUrl) {
      result.imageUrl = await takeScreenshotFallback(firecrawlKey, url, supabase);
    }

    return result;
  } catch {
    clearTimeout(timeoutId);
    const fallbackMeta = await scrapeArticleMetaDirect(url);
    result.imageUrl = fallbackMeta.imageUrl;
    result.publishedAt = fallbackMeta.publishedAt;
    if (!result.imageUrl) {
      result.imageUrl = await takeScreenshotFallback(firecrawlKey, url, supabase);
    }
    return result;
  }
}

function extractInlineImageUrls(content: string, baseUrl?: string): string[] {
  const found: string[] = [];
  const seen = new Set<string>();

  const add = (rawUrl: string) => {
    const cleaned = rawUrl.replace(/[),.;]+$/, "").trim();
    if (!cleaned) return;
    let resolved = cleaned;
    if (!/^https?:\/\//i.test(cleaned)) {
      if (!baseUrl) return;
      try { resolved = new URL(cleaned, baseUrl).toString(); } catch { return; }
    }
    const lower = resolved.toLowerCase();
    if (/\b(icon|favicon|logo|avatar|badge|sprite|pixel|tracking|spacer|arrow|chevron|caret|button|nav)\b/i.test(lower)) return;
    if (/\.(svg)(\?|$)/i.test(lower)) return;
    if (!/\.(png|jpg|jpeg|gif|webp|avif)(\?|$)/i.test(lower) && !/cdn|cloudfront|amazonaws|blob\.core|images?\//i.test(lower)) return;
    const dedupe = resolved.replace(/\?.*$/, "");
    if (seen.has(dedupe)) return;
    seen.add(dedupe);
    found.push(resolved);
  };

  let m: RegExpExecArray | null;
  const mdImageRegex = /!\[[^\]]*\]\(((?:[^()\s]|\([^)]*\))+)\)/gi;
  while ((m = mdImageRegex.exec(content)) !== null) add(m[1]);
  const imgTagRegex = /<img[^>]*(?:src|data-src)=["']([^"']+)["'][^>]*>/gi;
  while ((m = imgTagRegex.exec(content)) !== null) add(m[1]);
  const srcsetRegex = /srcset=["']([^"']+)["']/gi;
  while ((m = srcsetRegex.exec(content)) !== null) {
    const parts = m[1].split(",").map((p) => p.trim().split(/\s+/)[0]).filter(Boolean);
    for (const p of parts) add(p);
  }
  const bareImageUrlRegex = /(https?:\/\/[^\s"'<>]+\.(?:png|jpe?g|gif|webp|avif)(?:\?[^\s"'<>]*)?)/gi;
  while ((m = bareImageUrlRegex.exec(content)) !== null) add(m[1]);
  return found;
}

// --- English language detection ---
// Simple heuristic: checks that most characters are ASCII Latin and common English words appear
function isLikelyEnglish(title: string, content: string): boolean {
  const text = `${title} ${(content || "").slice(0, 500)}`;
  if (!text.trim()) return true; // empty = allow

  // Check ASCII ratio (English text is predominantly ASCII)
  const asciiCount = [...text].filter((c) => c.charCodeAt(0) < 128).length;
  const asciiRatio = asciiCount / text.length;
  if (asciiRatio < 0.7) return false;

  // Check for common English stop words
  const lower = text.toLowerCase();
  const englishWords = ["the ", " and ", " for ", " with ", " that ", " this ", " from ", " are ", " was ", " has ", " have ", " will ", " can ", " its ", " our ", " their "];
  const matchCount = englishWords.filter((w) => lower.includes(w)).length;
  if (matchCount < 2 && text.length > 50) return false;

  return true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const tavilyKey = Deno.env.get("TAVILY_API_KEY");
  const firecrawlKey = hasFirecrawlKey() ? "queue-managed" : null;
  const supabase = createClient(supabaseUrl, serviceKey);

  if (!tavilyKey && !Deno.env.get("ANTHROPIC_API_KEY")) {
    return new Response(JSON.stringify({ success: false, error: "Neither TAVILY_API_KEY nor ANTHROPIC_API_KEY is set" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // If no Tavily key at all, use Claude from the start
  if (!tavilyKey) {
    tavilyExhausted = true;
    console.log("No TAVILY_API_KEY configured — using Claude web search for all queries");
  }

  // Parse optional force flag and days parameter
  let force = false;
  let requestedDays = 31;
  try {
    const body = await req.json();
    force = body?.force === true;
    if (body?.days && typeof body.days === "number" && body.days > 0) {
      requestedDays = Math.min(body.days, 365);
    }
  } catch { /* no body = not forced */ }

  // --- Run window guard: only run at 00:00 UTC (daily) unless forced ---
  if (!force) {
    const now = new Date();
    const utcHour = now.getUTCHours();
    if (utcHour !== 0) {
      return new Response(JSON.stringify({
        success: true,
        skipped_reason: "Outside daily run window (00:00 UTC). Pass { \"force\": true } to override.",
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  }

  // --- 24h guard: skip if last successful fetch was < 24h ago ---
  if (!force) {
    const { data: recentItems } = await supabase
      .from("news_items")
      .select("fetched_at")
      .order("fetched_at", { ascending: false })
      .limit(1);

    if (recentItems && recentItems.length > 0) {
      const lastFetch = new Date(recentItems[0].fetched_at);
      const hoursSince = (Date.now() - lastFetch.getTime()) / (1000 * 60 * 60);
      if (hoursSince < 23) {
        console.log(`Skipping fetch: last fetch was ${hoursSince.toFixed(1)}h ago`);
        return new Response(JSON.stringify({
          success: true,
          skipped_reason: `Last fetch was ${hoursSince.toFixed(1)}h ago. Pass { \"force\": true } to override.`,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }
  }

  const results = { new_news: 0, new_community: 0, skipped_existing: 0, skipped_filter: 0, images_filled: 0, dates_filled: 0, expired_deleted: 0, names_fixed: 0, errors: [] as string[] };

  // --- Step 1: Delete articles older than retention window ---
  const retentionDays = Math.max(requestedDays, 365); // Keep up to 1 year
  const cutoffRetention = new Date();
  cutoffRetention.setDate(cutoffRetention.getDate() - retentionDays);
  const { data: expired } = await supabase
    .from("news_items")
    .select("id, published_at, fetched_at")
    .or(`published_at.lt.${cutoffRetention.toISOString()},and(published_at.is.null,fetched_at.lt.${cutoffRetention.toISOString()})`);
  if (expired && expired.length > 0) {
    const ids = expired.map((e: any) => e.id);
    await supabase.from("news_items").delete().in("id", ids);
    results.expired_deleted = ids.length;
    console.log(`Deleted ${ids.length} expired articles`);
  }
  
  // Use requested days for search scope
  const searchDays = Math.min(requestedDays, 365);

  // --- Step 2: Get all existing URLs to avoid overwriting ---
  const { data: existingRows } = await supabase
    .from("news_items")
    .select("source_url");
  const existingUrls = new Set((existingRows || []).map((r: any) => r.source_url));

  // --- Step 3: Discover new articles via Tavily ---
  // Build dynamic year strings based on search window
  const now = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - searchDays);
  const years = new Set<number>();
  for (let y = startDate.getFullYear(); y <= now.getFullYear(); y++) years.add(y);
  const yearStr = Array.from(years).join(" ");

  const newsQueries = [
    `Anaplan Planful Pigment new feature product launch ${yearStr}`,
    `OneStream Jedox Vena Solutions product update release ${yearStr}`,
    `Oracle EPM SAP Analytics Cloud Workday Adaptive Planning product update ${yearStr}`,
    `Datarails Board International Prophix Workiva product announcement ${yearStr}`,
    `FP&A EPM software product release update ${yearStr}`,
  ];

  // Add extra queries for longer time ranges to maximize coverage
  if (searchDays > 31) {
    newsQueries.push(
      `Anaplan vs Planful vs Pigment competitive analysis ${yearStr}`,
      `OneStream Prophix Jedox enterprise planning news ${yearStr}`,
      `Wolters Kluwer CCH Tagetik IBM Planning Analytics update ${yearStr}`,
    );
  }

  // Community queries — use different phrasings per time range to get diverse results
  const communityQueries: { query: string; topic?: string }[] = [
    { query: `site:reddit.com/r/FPandA Anaplan Planful Pigment OneStream review`, topic: "general" },
    { query: `site:reddit.com/r/FPandA Vena Datarails Jedox Board International EPM`, topic: "general" },
    { query: `site:reddit.com/r/FPandA Oracle EPM SAP Analytics Cloud planning software`, topic: "general" },
    { query: `site:reddit.com/r/CFO FP&A software EPM budgeting planning tool`, topic: "general" },
    { query: `Anaplan Planful Pigment FP&A user review feedback site:linkedin.com/pulse`, topic: "general" },
    { query: `OneStream Jedox Prophix EPM user experience review site:linkedin.com/pulse`, topic: "general" },
  ];

  // Add extended community queries for longer time ranges — specifically target older discussions
  if (searchDays > 31) {
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    // Build quarter/year specific queries to surface older content
    for (let m = 0; m < Math.min(searchDays / 30, 12); m++) {
      const targetDate = new Date();
      targetDate.setMonth(targetDate.getMonth() - m - 1);
      const monthName = monthNames[targetDate.getMonth()];
      const targetYear = targetDate.getFullYear();

      if (m % 3 === 0) {
        communityQueries.push(
          { query: `site:reddit.com FP&A software recommendation ${monthName} ${targetYear}`, topic: "general" },
          { query: `site:reddit.com EPM Anaplan Planful Pigment ${monthName} ${targetYear}`, topic: "general" },
        );
      }
    }

    communityQueries.push(
      { query: `site:reddit.com/r/FPandA best FP&A tool recommendation comparison`, topic: "general" },
      { query: `site:reddit.com/r/FPandA EPM software pros cons experience`, topic: "general" },
      { query: `site:reddit.com Anaplan vs Planful vs Pigment vs OneStream`, topic: "general" },
      { query: `site:reddit.com/r/FPandA budgeting forecasting software switched from`, topic: "general" },
      { query: `Anaplan Planful Pigment EPM comparison review site:linkedin.com/pulse ${yearStr}`, topic: "general" },
    );
  }

  const newItems: { r: any; type: "news" | "community" }[] = [];
  const seenUrls = new Set<string>();

  console.log(`Searching for new articles (days=${searchDays}, years=${yearStr}, community queries=${communityQueries.length})...`);

  // Run news queries
  for (const query of newsQueries) {
    try {
      const { results: items } = await tavilySearch(tavilyKey, query, searchDays);
      for (const r of items) {
        if (!mentionsCompetitor(r.title || "", r.content)) { results.skipped_filter++; continue; }
        if (seenUrls.has(r.url) || isIrrelevantUrl(r.url)) { results.skipped_filter++; continue; }
        seenUrls.add(r.url);
        if (existingUrls.has(r.url)) { results.skipped_existing++; continue; }
        if (!isLikelyEnglish(r.title || "", r.content || "")) { results.skipped_filter++; continue; }
        const detectedName = detectCompetitorName(r.title || "", r.content);
        if (detectedName === "Workday Adaptive Planning") { results.skipped_filter++; continue; }
        if (isOfficialCompetitorSocial(r.url)) { results.skipped_filter++; continue; }
        if (!isProductRelevant(r.title || "", r.content)) { results.skipped_filter++; continue; }
        r._seedImageUrl = r.image_url || r.image || r.thumbnail || r.thumbnail_url || r.favicon || null;
        newItems.push({ r, type: "news" });
      }
    } catch (e) {
      results.errors.push(`News search failed: ${e.message}`);
    }
  }

  // Run community queries with topic override
  for (const cq of communityQueries) {
    try {
      const { results: items } = await tavilySearch(tavilyKey, cq.query, searchDays, cq.topic);
      for (const r of items) {
        if (!mentionsCompetitor(r.title || "", r.content)) { results.skipped_filter++; continue; }
        if (seenUrls.has(r.url) || isIrrelevantUrl(r.url)) { results.skipped_filter++; continue; }
        seenUrls.add(r.url);
        if (existingUrls.has(r.url)) { results.skipped_existing++; continue; }
        if (!isLikelyEnglish(r.title || "", r.content || "")) { results.skipped_filter++; continue; }
        const detectedName = detectCompetitorName(r.title || "", r.content);
        if (detectedName === "Workday Adaptive Planning") { results.skipped_filter++; continue; }
        if (isOfficialCompetitorSocial(r.url)) { results.skipped_filter++; continue; }
        
        // For community items, try to extract date from Tavily's published_date field
        if (r.published_date || r.publishedDate || r.date) {
          r._tavilyDate = r.published_date || r.publishedDate || r.date;
        }

        r._seedImageUrl = r.image_url || r.image || r.thumbnail || r.thumbnail_url || r.favicon || null;
        newItems.push({ r, type: "community" });
      }
    } catch (e) {
      results.errors.push(`Community search failed: ${e.message}`);
    }
  }
  console.log(`Found ${newItems.length} new articles (${results.skipped_existing} already in DB)`);

  // --- Step 4: For each NEW article/community item, scrape image + date from the page ---
  if (firecrawlKey) {
    for (let batch = 0; batch < newItems.length; batch += 3) {
      const chunk = newItems.slice(batch, batch + 3);
      const metaResults = await Promise.allSettled(
        chunk.map(item => scrapeArticleMeta(firecrawlKey, item.r.url, supabase, item.r.title || ""))
      );
      metaResults.forEach((result, j) => {
        if (result.status === "fulfilled") {
          if (result.value.imageUrl) chunk[j].r._imageUrl = result.value.imageUrl;
          if (result.value.publishedAt) chunk[j].r._publishedAt = result.value.publishedAt;
        }
      });
    }
  }

  // --- Step 4b: Fetch real dates for Reddit posts via JSON API ---
  for (const item of newItems) {
    if (item.r._publishedAt || item.r._tavilyDate) continue;
    if (!item.r.url.includes("reddit.com/r/")) continue;
    try {
      const match = item.r.url.match(/\/comments\/([a-z0-9]+)/i);
      if (!match) continue;
      const idNum = parseInt(match[1], 36);
      const refId = parseInt("1m8jugx", 36);
      const refDate = new Date("2026-03-08T00:00:00Z");
      const idsPerDay = 282434000 / 365;
      const daysDiff = (idNum - refId) / idsPerDay;
      const estimated = new Date(refDate.getTime() + daysDiff * 86400000);
      const nowMs = Date.now();
      const oneYearAgoMs = nowMs - 365 * 86400000;
      // Clamp: never in the future, never older than 365 days
      if (estimated.getTime() > nowMs) {
        estimated.setTime(nowMs - 5 * 86400000); // fallback to ~5 days ago
      }
      if (estimated.getTime() >= oneYearAgoMs && estimated.getTime() <= nowMs) {
        item.r._redditDate = estimated.toISOString();
      }
    } catch { /* ignore */ }
  }

  // Insert all new items
  for (const { r, type } of newItems) {
    try {
      const imageUrl = r._imageUrl || r._seedImageUrl || null;
      // Priority: scraped date > Reddit API date > Tavily date > parsed from title/URL > now
      const publishedAt = r._publishedAt
        || r._redditDate
        || parseDateLoose(r._tavilyDate)
        || parseDateLoose(r.published_date || r.publishedDate || r.date || "")
        || parseDateLoose(r.title || "")
        || null;

      // If we still have no date and it's a social URL, skip rather than assign "now" (prevents stale dating)
      const finalDate = publishedAt || (isSocialMedia(r.url) ? null : new Date().toISOString());
      if (!finalDate) {
        // For social posts with unknown dates, still insert but with null published_at
        // so they appear in "Recent" but don't pollute time-range filters
      }

      const publishedDateObj = finalDate ? new Date(finalDate) : null;
      const oneYearAgoCutoff = new Date(Date.now() - 365 * 86400000);
      // Reject items older than 365 rolling days OR in the future
      if (publishedDateObj && !isNaN(publishedDateObj.getTime())) {
        if (publishedDateObj < oneYearAgoCutoff || publishedDateObj.getTime() > Date.now() + 86400000) {
          results.skipped_filter++;
          continue;
        }
      }

      const competitorName = detectCompetitorName(r.title || "", r.content);
      const { error } = await supabase.from("news_items").insert({
        title: r.title || "Untitled",
        summary: r.content?.slice(0, 500) || null,
        source_url: r.url,
        source_name: competitorName,
        image_url: imageUrl,
        item_type: type,
        published_at: finalDate || null,
        fetched_at: new Date().toISOString(),
      });
      if (!error) {
        if (type === "news") results.new_news++;
        else results.new_community++;
      }
    } catch (e) {
      results.errors.push(`Insert failed: ${e.message}`);
    }
  }

  // --- Step 5: Backfill missing thumbnails and dates for EXISTING items (news + community) ---
  if (firecrawlKey) {
    const { data: missingMedia } = await supabase
      .from("news_items")
      .select("id, source_url, title, image_url, published_at, fetched_at")
      .or("image_url.is.null,published_at.is.null,source_url.ilike.%/discussion/%,source_url.ilike.%/categories/%")
      .order("fetched_at", { ascending: false })
      .limit(300);

    if (missingMedia && missingMedia.length > 0) {
      console.log(`Backfilling ${missingMedia.length} items with missing image/date...`);
      for (let batch = 0; batch < missingMedia.length; batch += 3) {
        const chunk = missingMedia.slice(batch, batch + 3);
        const metaResults = await Promise.allSettled(
          chunk.map((item: any) => scrapeArticleMeta(firecrawlKey, item.source_url, supabase, item.title || ""))
        );
        for (let j = 0; j < chunk.length; j++) {
          const meta = metaResults[j];
          if (meta.status !== "fulfilled") continue;
          const updates: Record<string, any> = {};
          const shouldRefreshImage = !chunk[j].image_url || shouldPreferScreenshot(chunk[j].source_url || "");
          if (shouldRefreshImage) {
            // For forum/community pages, remove bad legacy thumbnails if screenshot extraction fails
            updates.image_url = meta.value.imageUrl || null;
            if (meta.value.imageUrl) results.images_filled++;
          }

          if (!chunk[j].published_at) {
            const derivedDate = meta.value.publishedAt || parseDateLoose(chunk[j].title || "") || parseDateLoose(chunk[j].source_url || "") || new Date().toISOString();
            const derivedObj = new Date(derivedDate);
            if (!isNaN(derivedObj.getTime()) && derivedObj < cutoffRetention) {
              await supabase.from("news_items").delete().eq("id", chunk[j].id);
              continue;
            }
            updates.published_at = derivedDate;
            results.dates_filled++;
          }
          if (Object.keys(updates).length > 0) {
            await supabase.from("news_items").update(updates).eq("id", chunk[j].id);
          }
        }
      }
    }
  }

  // --- Step 6: Force social URLs (especially LinkedIn) into community section ---
  const { error: socialFixError } = await supabase
    .from("news_items")
    .update({ item_type: "community" })
    .or("source_url.ilike.%://linkedin.com/%,source_url.ilike.%://www.linkedin.com/%,source_url.ilike.%://reddit.com/%,source_url.ilike.%://www.reddit.com/%,source_url.ilike.%://twitter.com/%,source_url.ilike.%://www.twitter.com/%,source_url.ilike.%://x.com/%,source_url.ilike.%://www.x.com/%,source_url.ilike.%://youtube.com/%,source_url.ilike.%://www.youtube.com/%,source_url.ilike.%://facebook.com/%,source_url.ilike.%://www.facebook.com/%,source_url.ilike.%://quora.com/%,source_url.ilike.%://www.quora.com/%")
    .neq("item_type", "community");
  if (socialFixError) {
    results.errors.push(`Social routing fix failed: ${socialFixError.message}`);
  }

  // --- Step 7: Backfill competitor names for existing items that still have domain-style source_name ---
  const { data: allItems } = await supabase
    .from("news_items")
    .select("id, title, summary, source_name, source_url");
  if (allItems) {
    for (const item of allItems as any[]) {
      if (item.source_name && item.source_name.includes(".")) {
        // Check title + summary + URL for competitor name
        const detected = detectCompetitorName(item.title || "", `${item.summary || ""} ${item.source_url || ""}`);
        if (detected !== "Other") {
          await supabase.from("news_items").update({ source_name: detected }).eq("id", item.id);
          results.names_fixed++;
        }
      }
    }
    if (results.names_fixed > 0) console.log(`Fixed ${results.names_fixed} competitor names`);
  }

  console.log("Fetch-news results:", JSON.stringify(results));

  return new Response(JSON.stringify({ success: true, ...results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
