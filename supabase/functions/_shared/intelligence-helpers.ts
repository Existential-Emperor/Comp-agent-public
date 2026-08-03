// Intelligence retrieval helpers — extracted from chat-analysis for bundle size optimization

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { hasFirecrawlKey, firecrawlFetch } from "./firecrawl-keys.ts";
import { monitoredFetch } from "./monitored-fetch.ts";
import { getProductAreaDescription } from "./product-areas.ts";
import {
  getCompetitorNameVariants, isPageSemanticlyRelevant,
  isHighValueCachedScreenshot, isVideoOnlyCompetitor,
} from "./media-helpers.ts";
import { getProfilesByNames, getPriorityUrls } from "./competitor-profiles.ts";

// ===== URL extraction utility =====

/**
 * Extracts URLs from a user message for auto-scraping.
 */
export function extractUrls(message: string): string[] {
  if (!message) return [];
  const seen = new Set<string>();
  const result: string[] = [];

  // 1. Extract explicit URLs (https://... or http://...)
  const explicitMatches = message.match(/https?:\/\/[^\s)<>]+/g);
  if (explicitMatches) {
    for (let url of explicitMatches) {
      url = url.replace(/[.,;:!?]+$/, "");
      if (!seen.has(url)) {
        seen.add(url);
        result.push(url);
      }
    }
  }

  // 2. Detect bare domain-like strings (e.g., "stacks.ai", "company.com", "planful.io")
  // Match word-boundary domain patterns NOT already prefixed with http(s)://
  const bareDomainRegex = /(?<![\/\w.-])([a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.(?:com|io|ai|co|dev|app|net|org|tech|cloud|software|solutions|finance|xyz|info|biz|us|uk|eu|de|fr|ca|au))(?:\b|[^\w]|$)/gi;
  let match;
  while ((match = bareDomainRegex.exec(message)) !== null) {
    const domain = match[1].toLowerCase();
    const asUrl = `https://${domain}`;
    // Skip if we already have this URL from explicit matches
    if (!seen.has(asUrl) && !result.some(u => u.includes(domain))) {
      seen.add(asUrl);
      result.push(asUrl);
    }
  }

  return result;
}

// ===== Cached intelligence retrieval =====

export async function getCachedIntelligence(
  competitor: string, subCategory: string, category: string
): Promise<{ intelligence: string; media: string; hasCachedData: boolean; hasRelevantMedia: boolean }> {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return { intelligence: "", media: "", hasCachedData: false, hasRelevantMedia: false };

  const supaClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
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
    const pageMeta = (page as any).metadata as Record<string, unknown> | null;
    if (pageMeta && Array.isArray(pageMeta.video_urls) && pageMeta.video_urls.length > 0) {
      const relevant = isPageSemanticlyRelevant(page, category, subCategory);
      if (relevant) {
        for (const vUrl of pageMeta.video_urls) {
          if (typeof vUrl === "string" && vUrl.startsWith("http")) {
            mediaRefs.push(`[Official Video] ${competitor} ${page.title || "Product Video"} - ${subCategory}: ${vUrl}`);
          }
        }
        console.log(`Added ${pageMeta.video_urls.length} video URLs from page: "${page.title}"`);
      }
    }
    if (page.content_summary) {
      const summary = page.content_summary;
      const embeddedVideoRegexes = [
        /https?:\/\/(?:www\.)?youtube\.com\/watch\?v=([a-zA-Z0-9_-]+)/gi,
        /https?:\/\/(?:www\.)?youtube\.com\/embed\/([a-zA-Z0-9_-]+)/gi,
        /https?:\/\/youtu\.be\/([a-zA-Z0-9_-]+)/gi,
      ];
      for (const re of embeddedVideoRegexes) {
        let vm: RegExpExecArray | null;
        while ((vm = re.exec(summary)) !== null) {
          const videoId = vm[1];
          const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
          if (!mediaRefs.some(r => r.includes(videoId))) {
            mediaRefs.push(`[Embedded Video] ${competitor} ${page.title || "Product Video"} - ${subCategory}: ${videoUrl}`);
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

// ===== Live intelligence gathering =====

export async function gatherLiveIntelligenceAndMedia(
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

  // Priority seed: scrape sheet-provided URLs FIRST (no discovery latency).
  // For the primary website we do a shallow CRAWL (limit 8, depth 2) to honor
  // "crawl the website end-to-end" — typed links still get single-page scrapes.
  try {
    const profiles = await getProfilesByNames([competitor]);
    const priorityUrls = getPriorityUrls(profiles[0]);
    const primaryWebsite = profiles[0]?.website || "";
    if (priorityUrls.length > 0 && hasFirecrawlKey()) {
      console.log(`Priority Firecrawl seed for ${competitor}: ${priorityUrls.length} sheet URLs`);
      for (const url of priorityUrls) {
        const isPrimary = url === primaryWebsite;
        if (isPrimary) {
          // Shallow site crawl for the primary website — async-poll pattern.
          parallelTasks.push((async () => {
            try {
              const startRes = await firecrawlFetch("https://api.firecrawl.dev/v1/crawl", {
                method: "POST",
                body: JSON.stringify({
                  url,
                  limit: 8,
                  maxDepth: 2,
                  scrapeOptions: { formats: ["markdown"], onlyMainContent: true },
                }),
              });
              if (!startRes.ok) return;
              const startData = await startRes.json();
              const jobId = startData.id || startData.jobId;
              const statusUrl = startData.url || (jobId ? `https://api.firecrawl.dev/v1/crawl/${jobId}` : "");
              if (!statusUrl) return;
              // Poll up to ~25s.
              for (let i = 0; i < 10; i++) {
                await new Promise((r) => setTimeout(r, 2500));
                const sRes = await firecrawlFetch(statusUrl, { method: "GET" });
                if (!sRes.ok) continue;
                const sData = await sRes.json();
                if (sData.status === "completed" || (Array.isArray(sData.data) && sData.data.length > 0 && sData.status !== "scraping")) {
                  const pages = (sData.data || []).slice(0, 8);
                  const aggregated = pages
                    .map((p: any) => `[Sheet-priority crawl: ${p.metadata?.sourceURL || url}]\n${(p.markdown || "").slice(0, 1500)}`)
                    .join("\n\n");
                  if (aggregated) intelligenceResults.push(aggregated.slice(0, 12000));
                  return;
                }
              }
            } catch (e) {
              console.error(`Priority crawl failed for ${url}:`, e);
            }
          })());
        } else {
          parallelTasks.push(
            firecrawlFetch("https://api.firecrawl.dev/v1/scrape", {
              method: "POST",
              body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true }),
            }).then(async (res) => {
              if (!res.ok) return;
              const data = await res.json();
              const md = data.data?.markdown || data.markdown || "";
              if (md) intelligenceResults.push(`[Sheet-priority scrape: ${url}] ${md.slice(0, 2000)}`);
            }).catch((e) => console.error(`Priority scrape failed for ${url}:`, e)),
          );
        }
      }
    }
  } catch (e) {
    console.error("Priority seed lookup failed:", e);
  }

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
            if (markdown) { intelligenceResults.push(`[Scraped: ${url}] ${markdown.slice(0, 2000)}`); break; }
          } catch { /* skip */ }
        }
      })()
    );
  }

  await Promise.all(parallelTasks);

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

// ===== Claude web search =====

export async function claudeWebSearch(query: string, maxUses = 3): Promise<string[]> {
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

// ===== Auto-scrape URLs from user messages =====

/**
 * Scrapes URLs found in user messages using Firecrawl.
 * Returns extracted content as intelligence strings.
 */
export async function scrapeUserUrls(urls: string[]): Promise<string[]> {
  if (!urls || urls.length === 0 || !hasFirecrawlKey()) return [];

  const results: string[] = [];
  const scrapePromises = urls.map(async (url) => {
    try {
      console.log(`Auto-scraping user-provided URL: ${url}`);
      const res = await firecrawlFetch("https://api.firecrawl.dev/v1/scrape", {
        method: "POST",
        body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true }),
      });
      if (res.ok) {
        const data = await res.json();
        const markdown = data.data?.markdown || data.markdown || "";
        if (markdown.length > 50) {
          results.push(`[Direct scrape: ${url}] ${markdown}`);
          console.log(`Auto-scraped ${markdown.length} chars from ${url}`);
        }
      }
    } catch (e) {
      console.error(`Auto-scrape failed for ${url}:`, e);
    }
  });
  await Promise.all(scrapePromises);
  return results;
}

// ===== Subpage discovery and deep scraping =====

/**
 * Discovers all subpages on a domain using Firecrawl MAP, scrapes them all,
 * then follows high-value external links one level deep.
 */
export async function discoverAndScrapeSubpages(domain: string): Promise<string[]> {
  if (!hasFirecrawlKey()) return [];

  const results: string[] = [];
  const domainUrl = domain.startsWith("http") ? domain : `https://${domain}`;
  const domainHost = domainUrl.replace(/^https?:\/\//, "").replace(/\/.*$/, "").toLowerCase();

  // Step 1: MAP the domain to discover all URLs
  console.log(`Subpage discovery: mapping ${domainUrl}`);
  try {
    const mapRes = await firecrawlFetch("https://api.firecrawl.dev/v1/map", {
      method: "POST",
      body: JSON.stringify({ url: domainUrl, limit: 1000, includeSubdomains: false }),
    });
    if (!mapRes.ok) {
      console.error(`MAP failed for ${domainUrl}: ${mapRes.status}`);
      return [];
    }
    const mapData = await mapRes.json();
    const discoveredUrls: string[] = mapData.links || mapData.data?.links || [];
    console.log(`Subpage discovery: found ${discoveredUrls.length} URLs on ${domainHost}`);

    if (discoveredUrls.length === 0) return [];

    // Step 2: Scrape ALL discovered subpages in parallel batches of 5
    const externalLinks = new Set<string>();
    const BATCH_SIZE = 5;

    for (let i = 0; i < discoveredUrls.length; i += BATCH_SIZE) {
      const batch = discoveredUrls.slice(i, i + BATCH_SIZE);
      const batchPromises = batch.map(async (pageUrl) => {
        try {
          const res = await firecrawlFetch("https://api.firecrawl.dev/v1/scrape", {
            method: "POST",
            body: JSON.stringify({ url: pageUrl, formats: ["markdown", "links"], onlyMainContent: true }),
          });
          if (!res.ok) return;
          const data = await res.json();
          const markdown = data.data?.markdown || data.markdown || "";
          if (markdown.length > 50) {
            results.push(`[Subpage: ${pageUrl}] ${markdown}`);
            console.log(`Subpage scraped: ${pageUrl} (${markdown.length} chars)`);
          }
          // Extract external links for one-level-deep follow
          const links: string[] = data.data?.links || data.links || [];
          for (const link of links) {
            if (typeof link === "string" && link.startsWith("http") && !isInternalOrJunkLink(link, domainHost)) {
              externalLinks.add(link);
            }
          }
          // Also regex-extract from markdown
          const mdLinks = markdown.match(/https?:\/\/[^\s)\]>"]+/g) || [];
          for (const ml of mdLinks) {
            if (!isInternalOrJunkLink(ml, domainHost)) {
              externalLinks.add(ml.replace(/[.,;:!?]+$/, ""));
            }
          }
        } catch (e) {
          console.error(`Subpage scrape failed for ${pageUrl}:`, e);
        }
      });
      await Promise.all(batchPromises);
    }

    // Step 3: Filter external links to high-value ones
    const highValueKeywords = ["blog", "case-study", "case_study", "casestudy", "customer", "press", "news", "announce", "resource", "article", "story", "review", "report"];
    const highValueLinks = [...externalLinks].filter(url => {
      const lower = url.toLowerCase();
      return highValueKeywords.some(kw => lower.includes(kw));
    });
    console.log(`Subpage discovery: ${externalLinks.size} external links found, ${highValueLinks.length} high-value to follow`);

    // Step 4: Scrape external links one level deep in batches
    for (let i = 0; i < highValueLinks.length; i += BATCH_SIZE) {
      const batch = highValueLinks.slice(i, i + BATCH_SIZE);
      const batchPromises = batch.map(async (extUrl) => {
        try {
          const res = await firecrawlFetch("https://api.firecrawl.dev/v1/scrape", {
            method: "POST",
            body: JSON.stringify({ url: extUrl, formats: ["markdown"], onlyMainContent: true }),
          });
          if (!res.ok) return;
          const data = await res.json();
          const markdown = data.data?.markdown || data.markdown || "";
          if (markdown.length > 50) {
            results.push(`[External ref: ${extUrl}] ${markdown}`);
            console.log(`External ref scraped: ${extUrl} (${markdown.length} chars)`);
          }
        } catch (e) {
          console.error(`External scrape failed for ${extUrl}:`, e);
        }
      });
      await Promise.all(batchPromises);
    }

    console.log(`Subpage discovery complete: ${results.length} total content pieces from ${domainHost}`);
  } catch (e) {
    console.error(`Subpage discovery error for ${domain}:`, e);
  }

  return results;
}

/** Helper to filter out internal, social media, CDN, and junk links */
function isInternalOrJunkLink(url: string, domainHost: string): boolean {
  const lower = url.toLowerCase();
  // Internal links
  if (lower.includes(domainHost)) return true;
  // Social media
  if (/\b(twitter\.com|x\.com|linkedin\.com|facebook\.com|youtube\.com|instagram\.com|tiktok\.com|github\.com)\b/.test(lower)) return true;
  // CDN / asset URLs
  if (/\.(css|js|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot|mp4|webm|zip|pdf)(\?|$)/i.test(lower)) return true;
  // Auth/login
  if (/\b(login|signin|signup|auth|oauth|sso)\b/.test(lower)) return true;
  // Generic nav
  if (/\b(terms|privacy|cookie|legal|sitemap|careers|jobs)\b/.test(lower)) return true;
  return false;
}

// ===== Intent classification =====

/**
 * Intent-based research classifier using GPT-5 Nano.
 * Replaces the old keyword-trigger approach with semantic understanding.
 */
export async function classifyIntent(
  message: string,
  history: any[],
  context?: { competitor?: string; category?: string; subCategory?: string; agent?: "comp" | "feed" },
): Promise<{ needsResearch: boolean; needsGeneralResearch: boolean; searchQueries: string[]; urlsToScrape: string[]; reason: string }> {
  // Extract URLs from the message — always returned regardless of classification
  const messageUrls = extractUrls(message);

  // First message always needs research for comp agent
  if ((!history || history.length === 0) && context?.agent === "comp") {
    return { needsResearch: true, needsGeneralResearch: false, searchQueries: [message], urlsToScrape: messageUrls, reason: "first message in comp agent" };
  }

  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) {
    return { needsResearch: true, needsGeneralResearch: false, searchQueries: [message], urlsToScrape: messageUrls, reason: "no API key, defaulting to research" };
  }

  try {
    const classificationPrompt = `You are an intent classifier for a competitive intelligence platform focused on FP&A/EPM software.

Analyze the user's query and classify its intent. Determine:
1. Does it need COMPETITIVE RESEARCH (web search for product features, comparisons, capabilities, pricing, architecture, integrations)?
2. Does it need GENERAL COMPANY RESEARCH (leadership/CEO/CTO, funding rounds, revenue, valuation, market size, employee count, LinkedIn profiles, acquisitions, partnerships, company segment)?
3. Or is it a CONVERSATIONAL follow-up (greeting, clarification, opinion, thank you, simple question answerable from prior context)?

IMPORTANT RULES:
- If the message contains a URL (like https://...), it ALWAYS needs research. The URL should be treated as a research target.
- If the user mentions a company name (even unknown ones like "stacks.ai"), it ALWAYS needs research — never ask "which company do you mean?"
- Generate HIGHLY SPECIFIC search queries optimized for web search, NOT the raw user message.

SEARCH QUERY DIVERSIFICATION:
For company research requests, generate at LEAST 4 queries (ideally 6+) covering DISTINCT research dimensions:
1. Company overview — what they do, positioning, founding year, headquarters location
2. Product breakdown — features, modules, integrations, technical architecture, platform capabilities
3. Customers/companies using the product — market segment, user personas, case studies, testimonials
4. Funding round details (if private) or market cap (if public) — investors, valuation, fundraising history
5. Company leadership, CEO, founders — only include if likely discoverable via web search
6. Revenue or sales details — ARR, growth metrics, only include if likely discoverable via web search

If you discover additional relevant dimensions beyond these 6 (e.g. partnerships, acquisitions, competitive positioning, regulatory compliance, analyst reports), add queries for those too.

Each query must target a DIFFERENT information dimension. Never generate multiple queries about the same topic.

${context?.competitor ? `Current competitor context: ${context.competitor}` : "No specific competitor selected."}
${context?.category ? `Category: ${context.category} / ${context.subCategory}` : ""}
Agent: ${context?.agent || "comp"}

Recent conversation: ${history && history.length > 0 ? history.slice(-3).map((m: any) => `${m.role}: ${String(m.content).slice(0, 200)}`).join(" | ") : "none"}

Respond in JSON only:
{
  "needs_competitive_research": true/false,
  "needs_general_research": true/false,
  "search_queries": ["dimension 1 query", "dimension 2 query", "dimension 3 query", "dimension 4 query", ...],
  "reason": "brief explanation"
}

USER QUERY: "${message.replace(/"/g, '\\"')}"`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${LOVABLE_API_KEY}` },
      body: JSON.stringify({
        model: "openai/gpt-5.5",
        messages: [{ role: "user", content: classificationPrompt }],
        max_completion_tokens: 5000,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      const rawText = data.choices?.[0]?.message?.content || "";
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        // URLs in message always force research
        const hasUrls = messageUrls.length > 0;
        const result = {
          needsResearch: hasUrls || !!parsed.needs_competitive_research || !!parsed.needs_general_research,
          needsGeneralResearch: !!parsed.needs_general_research,
          searchQueries: Array.isArray(parsed.search_queries) ? parsed.search_queries : [message],
          urlsToScrape: messageUrls,
          reason: parsed.reason || "",
        };
        console.log(`Intent classification: research=${result.needsResearch}, generalResearch=${result.needsGeneralResearch}, urls=${result.urlsToScrape.length}, reason="${result.reason}"`);
        return result;
      }
    }
  } catch (e) {
    console.error("Intent classification error:", e);
  }

  // Fallback: assume research needed
  return { needsResearch: true, needsGeneralResearch: false, searchQueries: [message], urlsToScrape: messageUrls, reason: "classification failed, defaulting" };
}
