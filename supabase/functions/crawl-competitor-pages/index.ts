import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { firecrawlFetch, hasFirecrawlKey, getActiveFirecrawlKey } from "../_shared/firecrawl-keys.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── URL patterns to EXCLUDE (junk pages that don't contain product UI) ──
const EXCLUDE_URL_PATTERNS = [
  /sitemap\.xml/i,
  /\/tag\//i,
  /\/tags\//i,
  /\/author\//i,
  /\/page\/\d+/i,
  /\/p\d+$/i,
  /\/feed\/?$/i,
  /\/rss\/?$/i,
  /\/category\//i,
  /\/categories\//i,
  /\.(pdf|zip|csv|xlsx)$/i,
  /\/login/i,
  /\/signup/i,
  /\/register/i,
  /\/404/i,
  /\/search\?/i,
  /\/terms/i,
  /\/privacy/i,
  /\/cookie/i,
  /\/legal/i,
  /\/careers/i,
  /\/jobs/i,
  /\/press/i,
  /\/events\/?$/i,
  /\/webinar/i,
  /\/demo-request/i,
  /\/contact/i,
  /\/pricing\/?$/i,
  /\/community\/?$/i,
  /\/forum/i,
  /\/groups\/?$/i,
  /\/academy\/?$/i,
  /\/podcast/i,
  /\/newsletter/i,
  /\/about\/?$/i,
  /\/partners\/?$/i,
  /\/customers\/?$/i,
  /\/case-stud/i,
];

function isRelevantUrl(url: string): boolean {
  return !EXCLUDE_URL_PATTERNS.some(pattern => pattern.test(url));
}

// ── Score a URL by how likely it is to contain product UI screenshots ──
// Higher score = more likely to be a feature/docs page with actual product visuals
function scoreUrlForScreenshot(url: string): number {
  const lower = url.toLowerCase();
  let score = 0;

  // Strong positive: help center, docs, knowledge base pages with specific feature paths
  if (/\/(help|docs|documentation|kb|knowledge-base|support)\//.test(lower)) score += 30;
  if (/\/(guide|tutorial|walkthrough|getting-started|how-to)/.test(lower)) score += 25;
  
  // Feature-specific paths — these almost always have product UI
  if (/\/(dashboard|report|forecast|model|scenario|workflow|consolidation|budget|plan|analysis|formula|grid|module|integration|connector|import|export|template|chart|visualization|kpi|metric)/.test(lower)) score += 20;
  
  // Product feature pages on vendor sites
  if (/\/(product|feature|platform|solution)\/.+/.test(lower)) score += 10;
  // But NOT the root /product or /platform page (those are marketing)
  if (/\/(product|platform|solutions?)\/?$/.test(lower)) score -= 5;
  
  // Pages with step/chapter/section indicators (documentation structure)
  if (/\/(step|chapter|section|lesson|module)-?\d/i.test(lower)) score += 15;
  
  // Negative: pages unlikely to have useful product screenshots
  if (/\/(blog|news|press|events?|webinar|podcast|case-stud|customer-stor|about|team|career|partner)/.test(lower)) score -= 20;
  if (/\/(community|forum|groups?|academy|training|certification)/.test(lower)) score -= 15;
  if (/\/(release-note|changelog|what-?s-new)\/?$/i.test(lower)) score -= 5;
  // Marketing landing pages (usually hero images, not product UI)
  if (/\/(landing|campaign|offer|promo|trial|demo-request)/.test(lower)) score -= 15;

  return score;
}

// ── Competitor reference pages – targeting help centers, product docs, feature walkthroughs ──
const COMPETITOR_SOURCES: Record<string, { name: string; pages: { url: string; type: string }[] }> = {
  anaplan: {
    name: "Anaplan",
    pages: [
      // Help center – feature-specific docs with UI walkthroughs
      { url: "https://help.anaplan.com/dashboards-and-dashboard-pages-f9fc7c31-7049-4bf7-bcaa-bdf34c6e24d2", type: "docs" },
      { url: "https://help.anaplan.com/create-a-dashboard-d4e0ed0e-a470-46d5-9f2e-28c94d2bb9e2", type: "docs" },
      { url: "https://help.anaplan.com/chart-types-a9e3ad6b-4e3c-49e2-a7f2-7ad6e2be3aa3", type: "docs" },
      { url: "https://help.anaplan.com/report-types-and-settings-87c5b13b-87fc-44c9-bd8c-07c3e05e7fa9", type: "docs" },
      { url: "https://help.anaplan.com/planning-and-forecasting-d3a82f0c-65db-4d3d-9d3e-d7c23fb0d7d6", type: "docs" },
      { url: "https://help.anaplan.com/modeling-d47b25f5-5d1a-4d52-8b5d-1d9ac0e3b4f7", type: "docs" },
      { url: "https://help.anaplan.com/predictive-planning-8be31f90-5d25-4e11-b04f-6c6ad2e7db9b", type: "docs" },
      { url: "https://help.anaplan.com/anaplan-integrations-ce1b3b37-4c3e-4a5e-a5cf-59c7c5c3f7f9", type: "docs" },
    ],
  },
  onestream: {
    name: "OneStream",
    pages: [
      { url: "https://onestreamsoftware.com/knowledge-base/", type: "docs" },
      { url: "https://www.onestream.com/products/financial-close-consolidation/", type: "product" },
      { url: "https://www.onestream.com/products/planning-budgeting-forecasting/", type: "product" },
      { url: "https://www.onestream.com/products/financial-reporting-analytics/", type: "product" },
      { url: "https://www.onestream.com/products/financial-data-quality/", type: "product" },
      { url: "https://www.onestream.com/products/account-reconciliations/", type: "product" },
      { url: "https://www.onestream.com/platform/", type: "product" },
    ],
  },
  vena: {
    name: "Vena Solutions",
    pages: [
      { url: "https://developers.venasolutions.com/", type: "docs" },
      { url: "https://support.venasolutions.com/", type: "help" },
      { url: "https://www.venasolutions.com/product/reporting-analytics", type: "product" },
      { url: "https://www.venasolutions.com/product/planning-budgeting-forecasting", type: "product" },
      { url: "https://www.venasolutions.com/product/close-consolidation", type: "product" },
      { url: "https://www.venasolutions.com/product/integrations", type: "product" },
      { url: "https://www.venasolutions.com/product/ai", type: "product" },
    ],
  },
  planful: {
    name: "Planful",
    pages: [
      { url: "https://help.planful.com/", type: "help" },
      { url: "https://planful.com/platform/financial-planning/", type: "product" },
      { url: "https://planful.com/platform/financial-consolidation/", type: "product" },
      { url: "https://planful.com/platform/reporting/", type: "product" },
      { url: "https://planful.com/platform/workforce-planning/", type: "product" },
      { url: "https://planful.com/platform/planful-predict/", type: "product" },
    ],
  },
  pigment: {
    name: "Pigment",
    pages: [
      // Knowledge base – feature-specific docs with product UI
      { url: "https://kb.pigment.com/", type: "docs" },
      { url: "https://kb.pigment.com/docs/load-data-gsheets", type: "docs" },
      { url: "https://kb.pigment.com/v1/docs/pigment-ai", type: "docs" },
      { url: "https://kb.pigment.com/docs/connect-paylocity", type: "docs" },
    ],
  },
  oracle: {
    name: "Oracle EPM Cloud",
    pages: [
      // Specific tutorial pages with product UI walkthroughs (deep links, not index pages)
      { url: "https://docs.oracle.com/en/cloud/saas/planning-budgeting-cloud/pfusu/working_with_forms_100x3c53faaf.html", type: "docs" },
      { url: "https://docs.oracle.com/en/cloud/saas/planning-budgeting-cloud/pfusu/working_with_dashboards_100x3c536c09.html", type: "docs" },
      { url: "https://docs.oracle.com/en/cloud/saas/planning-budgeting-cloud/pfusu/working_with_infolets_100x3c534dbe.html", type: "docs" },
      { url: "https://docs.oracle.com/en/cloud/saas/planning-budgeting-cloud/pfusu/managing_approval_units_100x3c538c63.html", type: "docs" },
      { url: "https://docs.oracle.com/en/cloud/saas/planning-budgeting-cloud/pfusu/entering_data_into_forms_100x3c540b9d.html", type: "docs" },
      { url: "https://docs.oracle.com/en/cloud/saas/planning-budgeting-cloud/pfusu/creating_and_managing_reports_100x3c5381dc.html", type: "docs" },
      // User guide with task flows and UI
      { url: "https://docs.oracle.com/en/cloud/saas/planning-budgeting-cloud/pfusa/designing_and_creating_forms_100x38197524.html", type: "docs" },
      { url: "https://docs.oracle.com/en/cloud/saas/planning-budgeting-cloud/pfusa/creating_dashboards_100x38197cac.html", type: "docs" },
      // Product tour / video pages
      { url: "https://www.oracle.com/performance-management/planning/", type: "product" },
      { url: "https://www.oracle.com/performance-management/free-trial/", type: "product" },
    ],
  },
  sap: {
    name: "SAP Analytics Cloud",
    pages: [
      { url: "https://help.sap.com/docs/SAP_ANALYTICS_CLOUD", type: "docs" },
      { url: "https://help.sap.com/docs/SAP_ANALYTICS_CLOUD/00f68c2e08b941f081a3bc88e0ef52fa/", type: "docs" },
    ],
  },
};

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return hash.toString(36);
}

async function summarizeContent(content: string, competitor: string, pageType: string): Promise<string> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY || !content || content.length < 100) return content.slice(0, 2000);

  try {
    const res = await fetch("https://ai-gateway.lovable.dev/api/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          {
            role: "system",
            content: `You are a competitive intelligence analyst for Workday Adaptive Planning (EPM/FP&A software). Extract and summarize the most important product capabilities, features, differentiators, pricing signals, and technical architecture details from this ${pageType} page for ${competitor}. Focus on factual, specific details - not marketing fluff. Include any mention of: modeling/planning capabilities, AI/ML features, integrations, reporting, collaboration, deployment, and specialized modules. Output a structured summary under 1500 words.`,
          },
          { role: "user", content: content.slice(0, 30000) },
        ],
        max_tokens: 2000,
        temperature: 0.1,
      }),
    });
    if (!res.ok) return content.slice(0, 2000);
    const data = await res.json();
    return data.choices?.[0]?.message?.content || content.slice(0, 2000);
  } catch {
    return content.slice(0, 2000);
  }
}

// Patterns that indicate a page is an error/404/login page, not real product content
const JUNK_CONTENT_PATTERNS = [
  /page\s*not\s*found/i,
  /404\s*error/i,
  /this page (doesn't|does not) exist/i,
  /access\s*denied/i,
  /you (don't|do not) have permission/i,
  /sign\s*in\s*to\s*continue/i,
  /log\s*in\s*to\s*your\s*account/i,
];

function isJunkContent(markdown: string, title: string): boolean {
  const checkText = (title + " " + markdown.slice(0, 1000)).toLowerCase();
  return JUNK_CONTENT_PATTERNS.some(p => p.test(checkText));
}

// ── Count embedded media (images, diagrams) in page markdown ──
// Only pages with actual embedded visuals are worth screenshotting
function countEmbeddedMedia(markdown: string): number {
  let count = 0;
  // Markdown images: ![alt](url)
  const mdImages = markdown.match(/!\[[^\]]*\]\([^)]+\)/g);
  if (mdImages) count += mdImages.length;
  // HTML img tags: <img ... />
  const htmlImages = markdown.match(/<img\s[^>]+>/gi);
  if (htmlImages) count += htmlImages.length;
  // Inline base64 or data URIs (sometimes in docs)
  const dataUris = markdown.match(/data:image\/[^;]+;base64/gi);
  if (dataUris) count += dataUris.length;
  return count;
}

// Extract all meaningful images from page markdown (for pages already approved by semantic gate)
// Since the page is already confirmed as product-relevant, we use a broad filter:
// exclude only junk assets (icons, logos, SVGs, tracking pixels)
function extractAllPageImages(markdown: string): string[] {
  const found: string[] = [];
  const seen = new Set<string>();

  const addUrl = (rawUrl: string) => {
    const url = rawUrl.replace(/[),.;]+$/, "").trim();
    if (!/^https?:\/\//i.test(url)) return;
    const dedupe = url.replace(/\?.*$/, "");
    if (seen.has(dedupe)) return;

    const lower = url.toLowerCase();

    // Exclude junk: icons, logos, favicons, SVGs, tracking pixels, platform chrome
    if (/\b(icon|favicon|logo|avatar|badge|sprite|social|pixel|tracking|spacer|arrow|caret|chevron)\b/i.test(lower)) return;
    if (/\.(svg)(\?|$)/i.test(url)) return;
    // Exclude tiny dimension indicators (e.g., 1x1, 2x2 tracking pixels)
    if (/[/=]1x1|[/=]2x2|width=1|height=1/i.test(lower)) return;
    // Must be an image file or CDN image URL or document360/intercom image host
    if (!/\.(png|jpg|jpeg|gif|webp)(\?|$)/i.test(url) && !/images?\//i.test(url) && !/cdn\.|d33v4339|document360|intercom|cloudfront|amazonaws|blob\.core/i.test(url)) return;

    seen.add(dedupe);
    found.push(url);
  };

  // Markdown image syntax: ![alt](url) — handle nested parens in URLs (e.g., image(3).png)
  // Use a more robust approach: find ![...] then manually extract the balanced URL
  const mdSimpleRegex = /!\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/gi;
  let m: RegExpExecArray | null;
  while ((m = mdSimpleRegex.exec(markdown)) !== null) {
    addUrl(m[2]);
  }

  // Also catch URLs in markdown table cells or raw text that look like Document360/CDN image URLs
  const cdnUrlRegex = /(https?:\/\/cdn\.document360\.io\/[^\s"'<>)]+)/gi;
  while ((m = cdnUrlRegex.exec(markdown)) !== null) {
    addUrl(m[1]);
  }

  // HTML img tags: <img src="..." alt="...">
  const imgTagRegex = /<img[^>]*src=["'](https?:\/\/[^"']+)["'][^>]*>/gi;
  while ((m = imgTagRegex.exec(markdown)) !== null) {
    addUrl(m[1]);
  }

  // No cap — download all found images (download phase has its own cap)
  return found;
}

// ── Determine if a page's content looks like it has product UI or feature documentation ──
function hasProductUISignals(markdown: string, title: string): boolean {
  const text = (title + " " + markdown.slice(0, 5000)).toLowerCase();
  const uiTerms = [
    "dashboard", "report", "forecast", "model", "scenario", "workflow",
    "consolidation", "budget", "plan", "grid", "module", "wizard",
    "configuration", "settings", "formula", "template", "integration",
    "chart", "visualization", "kpi", "metric", "data source",
    "click", "navigate", "select", "drag", "drop", "tab", "panel",
    "screen", "view", "menu", "toolbar", "dialog", "modal",
    "step 1", "step 2", "step 3", "how to", "procedure", "instructions",
  ];
  let matchCount = 0;
  for (const term of uiTerms) {
    if (text.includes(term)) matchCount++;
  }
  // At least 3 UI-related terms = likely a feature/docs page
  return matchCount >= 3;
}

async function scrapePage(
  url: string,
  _firecrawlKey: string,
  takeScreenshot: boolean,
): Promise<{ markdown: string; screenshot: Uint8Array | null; title: string } | null> {
  try {
    const formats: string[] = ["markdown"];
    if (takeScreenshot) formats.push("screenshot");

    const res = await firecrawlFetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      body: JSON.stringify({ url, formats, onlyMainContent: true, waitFor: 2000 }),
    });

    if (!res.ok) {
      console.error(`Scrape failed for ${url}: ${res.status}`);
      return null;
    }

    const data = await res.json();
    const pageData = data.data || data;
    const markdown = pageData.markdown || "";
    const title = pageData.metadata?.title || "";

    if (isJunkContent(markdown, title)) {
      console.log(`Skipping junk/error page: ${url} (title: ${title})`);
      return null;
    }

    let screenshot: Uint8Array | null = null;
    if (takeScreenshot && pageData.screenshot) {
      const raw = pageData.screenshot;
      if (raw.startsWith("http")) {
        try {
          const imgRes = await fetch(raw);
          if (imgRes.ok) screenshot = new Uint8Array(await imgRes.arrayBuffer());
        } catch { /* skip */ }
      } else {
        try {
          const b64 = raw.replace(/^data:image\/\w+;base64,/, "");
          const bin = atob(b64);
          screenshot = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) screenshot[i] = bin.charCodeAt(i);
        } catch { /* skip */ }
      }
    }

    return { markdown, screenshot, title };
  } catch (err) {
    console.error(`Error scraping ${url}:`, err);
    return null;
  }
}

// Strict semantic gate: screenshot only pages likely to show useful product visuals
// (feature demos, product UI, workflows, dashboards), not text-heavy documentation sections.
async function shouldScreenshotPageSemantically(
  url: string,
  title: string,
  markdown: string,
  embeddedMediaCount: number,
): Promise<{ allow: boolean; reason: string }> {
  if (embeddedMediaCount <= 0) return { allow: false, reason: "no_media" };

  const lower = `${title} ${url} ${markdown.slice(0, 8000)}`.toLowerCase();

  // Positive product-visual signals
  const productSignals = [
    "dashboard", "board", "report", "chart", "grid", "table", "workflow", "scenario",
    "planner", "model", "forecast", "kpi", "settings", "module", "interface", "ui",
    "demo", "walkthrough", "tour", "feature", "screenshot", "screen", "visual",
  ];

  // Negative text-heavy/reference signals
  const textHeavySignals = [
    "api reference", "function reference", "release notes", "changelog", "glossary",
    "legal", "privacy", "terms", "faq", "troubleshooting", "known issues",
    "parameters", "syntax", "returns", "example usage", "deprecated",
  ];

  const productHits = productSignals.filter(s => lower.includes(s)).length;
  const negativeHits = textHeavySignals.filter(s => lower.includes(s)).length;

  // Require strong product context before even calling model
  if (productHits < 2) return { allow: false, reason: "weak_product_context" };
  if (negativeHits >= 4 && productHits <= 3) return { allow: false, reason: "text_reference_page" };

  // AI semantic validation for strictness
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) {
    return { allow: productHits >= 3 && negativeHits <= 2, reason: "heuristic_only" };
  }

  try {
    const res = await fetch("https://ai-gateway.lovable.dev/api/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        temperature: 0,
        max_tokens: 40,
        messages: [
          {
            role: "system",
            content:
              "You are a strict classifier for competitor analysis visuals. Return only ALLOW or REJECT. ALLOW only when the page is likely to contain product-offering visuals such as UI screenshots, feature demos, workflows, dashboards, or interface walkthroughs. Reject text-heavy docs/reference pages where screenshot would mostly show prose.",
          },
          {
            role: "user",
            content: `URL: ${url}\nTitle: ${title}\nEmbedded media count: ${embeddedMediaCount}\nContent excerpt:\n${markdown.slice(0, 3500)}`,
          },
        ],
      }),
    });

    if (!res.ok) {
      return { allow: productHits >= 3 && negativeHits <= 2, reason: `llm_error_${res.status}` };
    }

    const data = await res.json();
    const raw = (data.choices?.[0]?.message?.content || "").trim().toUpperCase();
    const allow = raw.startsWith("ALLOW");
    return { allow, reason: allow ? "semantic_allow" : "semantic_reject" };
  } catch {
    return { allow: productHits >= 3 && negativeHits <= 2, reason: "llm_exception" };
  }
}

async function discoverSubPages(baseUrl: string, _firecrawlKey: string, limit = 10): Promise<string[]> {
  try {
    const res = await firecrawlFetch("https://api.firecrawl.dev/v1/map", {
      method: "POST",
      body: JSON.stringify({ url: baseUrl, limit: limit * 4, includeSubdomains: true }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const allLinks: string[] = data.links || [];
    
    // Filter out junk URLs, then sort by screenshot relevance score
    const relevant = allLinks
      .filter(isRelevantUrl)
      .map(url => ({ url, score: scoreUrlForScreenshot(url) }))
      .sort((a, b) => b.score - a.score)
      .map(item => item.url);
    
    return relevant.slice(0, limit);
  } catch {
    return [];
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    if (!hasFirecrawlKey()) {
      return new Response(JSON.stringify({ error: "Firecrawl not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const FIRECRAWL_API_KEY = getActiveFirecrawlKey()!;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const body = await req.json().catch(() => ({}));

    // mode=trigger_all: fan out individual competitor calls
    if (body.mode === "full" || body.mode === "trigger_all") {
      const keys = Object.keys(COMPETITOR_SOURCES);
      const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";

      for (const key of keys) {
        fetch(`${SUPABASE_URL}/functions/v1/crawl-competitor-pages`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ competitor: key, run_type: "manual" }),
        }).catch(() => {});
      }

      return new Response(JSON.stringify({
        success: true,
        message: `Triggered crawl for ${keys.length} competitors individually`,
        competitors: keys.map(k => COMPETITOR_SOURCES[k].name),
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Single competitor mode
    const competitorKey = body.competitor as string;
    if (!competitorKey || !COMPETITOR_SOURCES[competitorKey]) {
      return new Response(JSON.stringify({
        error: "Specify a valid competitor key",
        available: Object.keys(COMPETITOR_SOURCES),
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const source = COMPETITOR_SOURCES[competitorKey];
    const runType = body.run_type || "manual";
    const maxSubPages = body.max_sub_pages || 5;

    // Fix any stale "running" records older than 10 min
    await supabase
      .from("crawler_runs")
      .update({ status: "completed", completed_at: new Date().toISOString(), errors: ["Timed out"] })
      .eq("status", "running")
      .lt("started_at", new Date(Date.now() - 10 * 60 * 1000).toISOString());

    const { data: runRecord } = await supabase
      .from("crawler_runs")
      .insert({ run_type: runType, status: "running", metadata: { competitor: source.name } })
      .select("id")
      .single();

    const runId = runRecord?.id;
    let totalPages = 0, totalUpdated = 0, totalScreenshots = 0;
    const errors: string[] = [];

    const updateRunProgress = async () => {
      if (!runId) return;
      await supabase.from("crawler_runs").update({
        pages_crawled: totalPages,
        pages_updated: totalUpdated,
        screenshots_taken: totalScreenshots,
        errors: errors.slice(0, 20),
      }).eq("id", runId);
    };

    console.log(`=== Crawling ${source.name} (${source.pages.length} root pages) ===`);

    // Prevent stale screenshot carry-over from previous crawl strategies
    // Only visuals approved in THIS run should remain attached to pages
    await supabase
      .from("competitor_pages")
      .update({ screenshot_urls: [] })
      .eq("competitor_name", source.name);

    // Phase 1: Scrape all pages (text only) and collect candidates for screenshotting
    type PageCandidate = {
      url: string;
      rootType: string;
      markdown: string;
      title: string;
      contentHash: string;
      existingId?: string;
      contentChanged: boolean;
      screenshotScore: number;
      embeddedMediaCount: number;
      savedImageUrls: string[]; // Images already downloaded+uploaded to permanent storage
    };
    const allCandidates: PageCandidate[] = [];

    for (const rootPage of source.pages) {
      try {
        console.log(`Mapping: ${rootPage.url}`);
        const subPages = await discoverSubPages(rootPage.url, FIRECRAWL_API_KEY, maxSubPages);
        const allUrls = [rootPage.url, ...subPages.filter(u => u !== rootPage.url)];
        console.log(`Found ${allUrls.length} pages`);

        for (const pageUrl of allUrls) {
          try {
            const { data: existing } = await supabase
              .from("competitor_pages")
              .select("id, content_hash, last_crawled_at")
              .eq("competitor_name", source.name)
              .eq("page_url", pageUrl)
              .maybeSingle();

            if (existing && runType !== "manual") {
              const hoursSinceCrawl = (Date.now() - new Date(existing.last_crawled_at).getTime()) / 3600000;
              if (hoursSinceCrawl < 24) {
                console.log(`Skipping recent: ${pageUrl}`);
                continue;
              }
            }

            // Phase 1: text-only scrape (no screenshot yet)
            console.log(`Scraping (text): ${pageUrl}`);
            const result = await scrapePage(pageUrl, FIRECRAWL_API_KEY, false);
            if (!result || !result.markdown || result.markdown.length < 50) continue;

            totalPages++;
            const contentHash = simpleHash(result.markdown);
            const contentChanged = !existing || existing.content_hash !== contentHash;

            const mediaCount = countEmbeddedMedia(result.markdown);
            let ssScore = scoreUrlForScreenshot(pageUrl);
            if (hasProductUISignals(result.markdown, result.title)) ssScore += 25;
            if (rootPage.type === "docs" && result.markdown.length > 500) ssScore += 10;
            
            if (mediaCount === 0) {
              ssScore = -999;
            } else {
              ssScore += Math.min(mediaCount * 10, 50);
            }

            // Track inline image count for scoring but DON'T try to download directly
            // (Document360/CDN images use signed tokens that are IP-restricted and fail from edge functions)
            // Instead, the screenshot-worker captures cropped viewport screenshots of the content area
            const savedImageUrls: string[] = [];
            const inlineImageCount = mediaCount > 0 ? extractAllPageImages(result.markdown).length : 0;
            if (inlineImageCount > 0) {
              console.log(`  Found ${inlineImageCount} inline images (will use cropped screenshot): ${pageUrl}`);
              // Boost score based on actual extractable images
              ssScore += Math.min(inlineImageCount * 5, 30);
            }

            console.log(`  Page scored: ${pageUrl} | media: ${mediaCount} | saved: ${savedImageUrls.length} | ssScore: ${ssScore}`);

            allCandidates.push({
              url: pageUrl,
              rootType: rootPage.type,
              markdown: result.markdown,
              title: result.title,
              contentHash,
              existingId: existing?.id,
              contentChanged,
              screenshotScore: ssScore,
              embeddedMediaCount: mediaCount,
              savedImageUrls,
            });
          } catch (err) {
            errors.push(`${pageUrl}: ${String(err).slice(0, 150)}`);
          }
        }
      } catch (err) {
        errors.push(`Root ${rootPage.url}: ${String(err).slice(0, 150)}`);
      }
    }

    // Phase 2: Select top pages for visuals
    // Priority 1: Pages with successfully pre-downloaded inline images (proven visual content)
    // Priority 2: High-scoring pages with embedded media (fallback to viewport screenshot)
    const MAX_SCREENSHOTS = 3;
    const forceScreenshots = body.force_screenshots === true;

    const rankedCandidates = [...allCandidates]
      .filter(c => c.embeddedMediaCount > 0 || c.savedImageUrls.length > 0)
      .sort((a, b) => b.screenshotScore - a.screenshotScore);

    const screenshotCandidates = rankedCandidates.slice(0, MAX_SCREENSHOTS);
    const screenshotUrlSet = new Set(screenshotCandidates.map(c => c.url));

    const textOnlyCount = allCandidates.filter(c => c.embeddedMediaCount === 0).length;
    console.log(`Phase 2: ${allCandidates.length} total, ${rankedCandidates.length} with media, ${textOnlyCount} text-only`);
    console.log(`Selected ${screenshotCandidates.length} pages for visuals:`,
      screenshotCandidates.map(c => `${c.url} (score: ${c.screenshotScore}, saved: ${c.savedImageUrls.length})`));

    // Phase 3: Store intelligence for all pages; fire off screenshot-worker for approved pages
    const SUPABASE_ANON_KEY2 = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";

    for (const candidate of allCandidates) {
      try {
        let summary = "";
        if (candidate.contentChanged) {
          summary = await summarizeContent(candidate.markdown, source.name, candidate.rootType);
          totalUpdated++;
        }

        const pageRecord = {
          competitor_name: source.name,
          page_url: candidate.url,
          page_type: candidate.rootType,
          title: candidate.title || candidate.url,
          content_summary: summary || undefined,
          raw_content: candidate.markdown.slice(0, 50000),
          screenshot_urls: [] as string[],
          content_hash: candidate.contentHash,
          word_count: candidate.markdown.split(/\s+/).length,
          last_crawled_at: new Date().toISOString(),
          content_updated_at: candidate.contentChanged ? new Date().toISOString() : undefined,
          crawl_status: "completed" as const,
        };

        let savedPageId: string | undefined;

        if (candidate.existingId) {
          savedPageId = candidate.existingId;
          const updateData: Record<string, unknown> = { ...pageRecord };
          delete updateData.competitor_name;
          delete updateData.page_url;
          if (!summary) delete updateData.content_summary;
          if (!candidate.contentChanged) delete updateData.content_updated_at;
          await supabase.from("competitor_pages").update(updateData).eq("id", candidate.existingId);
        } else {
          const { data: inserted } = await supabase.from("competitor_pages").insert(pageRecord).select("id").single();
          savedPageId = inserted?.id;
        }

        // Fire-and-forget: delegate cropped content screenshot to dedicated worker
        if (screenshotUrlSet.has(candidate.url)) {
          console.log(`Dispatching screenshot-worker (cropped) for: ${candidate.url}`);
          totalScreenshots++;
          fetch(`${SUPABASE_URL}/functions/v1/screenshot-worker`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${SUPABASE_ANON_KEY2}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              page_url: candidate.url,
              competitor_name: source.name,
              page_id: savedPageId,
              image_count: candidate.embeddedMediaCount,
            }),
          }).catch(err => console.error(`Failed to dispatch screenshot-worker: ${err}`));
        }

        await updateRunProgress();
      } catch (err) {
        errors.push(`${candidate.url}: ${String(err).slice(0, 150)}`);
      }
    }

    if (runId) {
      await supabase.from("crawler_runs").update({
        status: "completed",
        competitors_processed: 1,
        pages_crawled: totalPages,
        pages_updated: totalUpdated,
        screenshots_taken: totalScreenshots,
        errors: errors.slice(0, 20),
        completed_at: new Date().toISOString(),
      }).eq("id", runId);
    }

    const result = {
      success: true,
      competitor: source.name,
      run_id: runId,
      pages_crawled: totalPages,
      pages_updated: totalUpdated,
      screenshots_taken: totalScreenshots,
      screenshot_pages: screenshotCandidates.map(c => ({ url: c.url, score: c.screenshotScore })),
      errors_count: errors.length,
      errors: errors.slice(0, 5),
    };

    console.log("Done:", JSON.stringify(result));
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Crawl error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
