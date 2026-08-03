import { requireAuth } from "../_shared/auth.ts";
// Stage 2 of the news pipeline — two-tier date resolver.
// Tier A: Rich Firecrawl scrape (markdown + html), extract date from
//   metadata → raw HTML regex → JSON-LD → visible body patterns → loose parse.
// Tier B: If Tier A returns null, take a full-page screenshot via Firecrawl
//   and ask Lovable AI Gateway (vision) to read the date off the image.
// If both tiers fail, the row is marked status='failed_no_date' and is NOT
// inserted into news_items. We never silently fall back to a fake date.
//
// Privacy: only the public source_url and its own screenshot leave the system.
// No DB content / training-guide / user data ever sent outbound.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { firecrawlFetch, hasFirecrawlKey } from "../_shared/firecrawl-keys.ts";
import {
  parseDateLoose,
  clampDate,
  classifyGenre,
  extractDateFromHtml,
  isListingPage,
  isNewsRelevant,
  isProductRelevant,
  mentionsCompetitor,
  type QueueRow,
} from "../_shared/news-queue.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BATCH_SIZE = 5;
const MAX_RETRIES = 3;
const PER_SCRAPE_TIMEOUT_MS = 30000;
const VISION_TIMEOUT_MS = 25000;

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#x27;/g, "'");
}

function pickImage(metadata: Record<string, any>, baseUrl: string): string | null {
  const candidates = [
    metadata?.ogImage, metadata?.og_image, metadata?.["og:image"],
    metadata?.twitterImage, metadata?.twitter_image, metadata?.["twitter:image"],
  ].filter((u): u is string => typeof u === "string" && u.length > 10);
  for (const c of candidates) {
    try {
      const abs = new URL(c, baseUrl).toString();
      const lower = abs.toLowerCase();
      if (/(icon|favicon|logo|avatar|sprite|badge)/i.test(lower)) continue;
      if (/\.svg(\?|$)/i.test(lower)) continue;
      return abs;
    } catch {}
  }
  return null;
}

/** Tier B: ask Lovable AI vision to read the publication date off a screenshot. */
async function visionExtractDate(screenshotUrl: string): Promise<string | null> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) {
    console.warn("[news-hydrate] LOVABLE_API_KEY missing — skipping vision tier");
    return null;
  }
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), VISION_TIMEOUT_MS);
  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: "openai/gpt-5.5",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Look at this screenshot of a news article. Find the publication date displayed on the page (often near the title, byline, or footer). Respond with ONLY a JSON object: {\"date\": \"YYYY-MM-DD\"} or {\"date\": null} if no date is visible. Do not include any other text.",
              },
              { type: "image_url", image_url: { url: screenshotUrl } },
            ],
          },
        ],
      }),
    });
    clearTimeout(t);
    if (!res.ok) {
      console.warn(`[news-hydrate] vision gateway ${res.status}`);
      return null;
    }
    const data = await res.json();
    const content: string = data?.choices?.[0]?.message?.content || "";
    const jsonMatch = content.match(/\{[\s\S]*?\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]);
    if (!parsed?.date || typeof parsed.date !== "string") return null;
    return clampDate(parseDateLoose(parsed.date));
  } catch (e) {
    clearTimeout(t);
    console.warn(`[news-hydrate] vision error: ${(e as Error).message}`);
    return null;
  }
}

type HydrateResult = {
  publishedAt: string | null;
  dateSource: string | null;
  needsDateReview: boolean;
  imageUrl: string | null;
  summary: string | null;
  sourceName: string | null;
  resolvedTitle: string | null;
  rejectedReason: string | null;
  error?: string;
};

async function hydrateOne(row: QueueRow & { created_at?: string }): Promise<HydrateResult> {
  // ---------- Tier A: rich scrape ----------
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), PER_SCRAPE_TIMEOUT_MS);

  let publishedAt: string | null = null;
  let dateSource: string | null = null;
  let imageUrl: string | null = null;
  let summary: string | null = null;
  let sourceName: string | null = null;
  let scrapeError: string | undefined;
  let pageMarkdown = "";
  let pageHtml = "";
  let resolvedTitle: string | null = row.title || null;

  try {
    const res = await firecrawlFetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      body: JSON.stringify({
        url: row.source_url,
        formats: ["markdown", "html"],
        onlyMainContent: false,
        waitFor: 2000,
      }),
      signal: controller.signal,
    });
    clearTimeout(t);

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      scrapeError = `firecrawl ${res.status}: ${text.slice(0, 160)}`;
    } else {
      const data = await res.json();
      const page = data?.data || data || {};
      const meta = page.metadata || {};
      pageMarkdown = typeof page.markdown === "string" ? page.markdown : "";
      pageHtml = typeof page.html === "string" ? page.html : (typeof page.rawHtml === "string" ? page.rawHtml : "");

      // 1. Metadata fields
      const metaCandidates = [
        meta.publishedTime, meta.published_time, meta["article:published_time"],
        meta["og:article:published_time"], meta.datePublished, meta.date,
        meta.publishDate, meta["dc.date.issued"],
      ];
      for (const c of metaCandidates) {
        if (typeof c !== "string") continue;
        const parsed = clampDate(parseDateLoose(c));
        if (parsed) { publishedAt = parsed; dateSource = "firecrawl_meta"; break; }
      }

      // 2-4. HTML regex / JSON-LD / body patterns
      if (!publishedAt && pageHtml) {
        const fromHtml = extractDateFromHtml(pageHtml);
        if (fromHtml.date) { publishedAt = fromHtml.date; dateSource = fromHtml.source; }
      }

      // 5. Markdown loose parse (relative dates, "Month Year")
      if (!publishedAt && pageMarkdown) {
        const head = pageMarkdown.slice(0, 2000);
        const parsed = clampDate(parseDateLoose(head));
        if (parsed) { publishedAt = parsed; dateSource = "firecrawl_body"; }
      }

      imageUrl = pickImage(meta, row.source_url);

      // Capture the resolved page title from scraper metadata or first markdown header.
      const metaTitle = (meta.ogTitle || meta.og_title || meta["og:title"] || meta.title || "") as string;
      const headerMatch = pageMarkdown.match(/^\s*#\s+(.+?)\s*$/m);
      const headerTitle = headerMatch ? headerMatch[1] : "";
      const candidate = (metaTitle || headerTitle || "").trim();
      if (candidate && candidate.length > 5) resolvedTitle = candidate;

      if (pageMarkdown.length > 80) {
        const cleaned = pageMarkdown
          .replace(/^#+\s.*$/gm, "")
          .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
          .replace(/\n{2,}/g, "\n")
          .trim();
        summary = cleaned.slice(0, 500);
      }
    }
  } catch (e) {
    clearTimeout(t);
    scrapeError = (e as Error).message;
  }

  if (!summary && row.snippet) summary = row.snippet.slice(0, 500);
  if (summary) summary = decodeHtmlEntities(summary);

  try {
    const u = new URL(row.source_url);
    sourceName = u.hostname.replace(/^www\./, "");
  } catch {}

  // If the scrape itself failed hard and we have nothing, surface as error for retry
  if (scrapeError && !pageMarkdown && !pageHtml) {
    return {
      publishedAt: null, dateSource: null, needsDateReview: false,
      imageUrl: null, summary, sourceName,
      resolvedTitle, rejectedReason: null,
      error: scrapeError,
    };
  }

  // ---------- Post-scrape relevance gate ----------
  // The Anthropic snippet title can mask comparison/listicle pages whose real
  // <title> only surfaces after Firecrawl scrapes them. Re-run filters here
  // using the resolved page title + summary content.
  const titleForFilter = resolvedTitle || row.title || "";
  const contentForFilter = `${titleForFilter} ${(summary || "").slice(0, 1500)}`;

  // Listing/index page caught post-scrape (resolved title finally surfaces it).
  if (isListingPage(row.source_url, titleForFilter)) {
    return {
      publishedAt: null, dateSource: null, needsDateReview: false,
      imageUrl, summary, sourceName,
      resolvedTitle,
      rejectedReason: "post_scrape_listing_page",
    };
  }

  // Digest heuristic: many distinct dates appearing as bare list items (not
  // inline prose) suggests a listing/digest, not a single article. We exclude
  // dates that show up inside markdown links (sidebars, "Latest releases"
  // widgets) and only count dates rendered as standalone tokens within the
  // first 2KB. Threshold raised to 5 to avoid false positives on real press
  // releases that happen to mention a couple of comparable dates.
  if (pageMarkdown) {
    const head = pageMarkdown.slice(0, 2000);
    // Strip markdown links so dates inside [text](url) aren't counted.
    const stripped = head.replace(/\[[^\]]*\]\([^)]*\)/g, " ");
    const DATE_RE = /\b(?:\d{4}-\d{2}-\d{2}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},\s*\d{4})\b/gi;
    const dateMatches = stripped.match(DATE_RE) || [];
    const distinct = new Set(dateMatches.map((d) => d.toLowerCase()));
    if (distinct.size >= 5) {
      return {
        publishedAt: null, dateSource: null, needsDateReview: false,
        imageUrl, summary, sourceName,
        resolvedTitle,
        rejectedReason: "post_scrape_multi_date_digest",
      };
    }
  }

  if (!isNewsRelevant(titleForFilter, row.source_url)) {
    return {
      publishedAt: null, dateSource: null, needsDateReview: false,
      imageUrl, summary, sourceName,
      resolvedTitle,
      rejectedReason: "post_scrape_not_news_relevant",
    };
  }
  // Identity re-check on resolved title + summary (sometimes the snippet had
  // the competitor name only via a sidebar/navigation that disappears after
  // scrape; if so, this is not a real article about them).
  if (!mentionsCompetitor(titleForFilter, summary || "")) {
    return {
      publishedAt: null, dateSource: null, needsDateReview: false,
      imageUrl, summary, sourceName,
      resolvedTitle,
      rejectedReason: "post_scrape_no_competitor_mention",
    };
  }
  // Genre re-check — financial / research / other slip through SERP snippets
  // when the actual page only reveals the genre after scrape.
  const postGenre = classifyGenre(titleForFilter, summary || "");
  if (postGenre !== "product") {
    return {
      publishedAt: null, dateSource: null, needsDateReview: false,
      imageUrl, summary, sourceName,
      resolvedTitle,
      rejectedReason: `post_scrape_genre_${postGenre}`,
    };
  }
  if (!isProductRelevant(titleForFilter, contentForFilter)) {
    return {
      publishedAt: null, dateSource: null, needsDateReview: false,
      imageUrl, summary, sourceName,
      resolvedTitle,
      rejectedReason: "post_scrape_not_product_relevant",
    };
  }

  // ---------- Tier B: vision fallback (full-page screenshot) ----------
  if (!publishedAt) {
    console.log(`[news-hydrate] tier-A miss, trying vision: ${row.source_url}`);
    try {
      const shotController = new AbortController();
      const st = setTimeout(() => shotController.abort(), PER_SCRAPE_TIMEOUT_MS);
      const shotRes = await firecrawlFetch("https://api.firecrawl.dev/v1/scrape", {
        method: "POST",
        body: JSON.stringify({
          url: row.source_url,
          formats: ["screenshot"],
          onlyMainContent: false,
          waitFor: 2000,
          screenshot: { fullPage: true },
        }),
        signal: shotController.signal,
      });
      clearTimeout(st);
      if (shotRes.ok) {
        const shotData = await shotRes.json();
        const shotPage = shotData?.data || shotData || {};
        const screenshotUrl: string | undefined =
          shotPage.screenshot || shotPage.screenshotUrl || shotPage.metadata?.screenshot;
        if (screenshotUrl && typeof screenshotUrl === "string") {
          const visionDate = await visionExtractDate(screenshotUrl);
          if (visionDate) {
            publishedAt = visionDate;
            dateSource = "vision_screenshot";
            console.log(`[news-hydrate] vision date hit: ${visionDate} for ${row.source_url}`);
          }
        }
      } else {
        console.warn(`[news-hydrate] screenshot scrape ${shotRes.status} for ${row.source_url}`);
      }
    } catch (e) {
      console.warn(`[news-hydrate] screenshot error: ${(e as Error).message}`);
    }
  }

  // No fallback. If both tiers missed, leave publishedAt null — caller flags it.
  return {
    publishedAt, dateSource, needsDateReview: false,
    imageUrl, summary, sourceName,
    resolvedTitle, rejectedReason: null,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // --- Auth guard (shared): valid user JWT or service-role key required ---
  const authError = await requireAuth(req, corsHeaders);
  if (authError) return authError;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  if (!hasFirecrawlKey()) {
    return new Response(JSON.stringify({ success: false, error: "Firecrawl not configured" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Pull next batch (FIFO oldest first) and atomically mark processing
  const { data: pending, error: pickErr } = await supabase
    .from("news_ingestion_queue")
    .select("id, run_id, competitor_name, source_url, title, snippet, status, retry_count, created_at")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (pickErr) {
    return new Response(JSON.stringify({ success: false, error: pickErr.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!pending || pending.length === 0) {
    return new Response(JSON.stringify({ success: true, hydrated: 0, drained: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const ids = pending.map((r: any) => r.id);
  await supabase
    .from("news_ingestion_queue")
    .update({ status: "processing" })
    .in("id", ids);

  const stats = { hydrated: 0, failed: 0, retried: 0, vision_used: 0, no_date: 0, filtered: 0 };

  const settled = await Promise.allSettled(
    (pending as any[]).map((row) => hydrateOne(row).then((r) => ({ row, ...r }))),
  );

  let noDate = 0;
  for (const s of settled) {
    if (s.status !== "fulfilled") {
      stats.failed++;
      continue;
    }
    const { row, publishedAt, dateSource, needsDateReview, imageUrl, summary, sourceName, resolvedTitle, rejectedReason, error } = s.value;
    if (error) {
      const newCount = (row.retry_count || 0) + 1;
      const finalStatus = newCount >= MAX_RETRIES ? "failed" : "pending";
      await supabase.from("news_ingestion_queue").update({
        status: finalStatus,
        retry_count: newCount,
        last_error: error.slice(0, 500),
      }).eq("id", row.id);
      if (finalStatus === "failed") stats.failed++;
      else stats.retried++;
      continue;
    }
    // Post-scrape filter rejected this item — drop it, never insert into news_items.
    if (rejectedReason) {
      console.log(`[news-hydrate] FILTER REJECT ${rejectedReason} | ${row.source_url} | ${(resolvedTitle || row.title || "").slice(0, 120)}`);
      await supabase.from("news_ingestion_queue").update({
        status: "filtered",
        title: resolvedTitle || row.title,
        last_error: rejectedReason,
      }).eq("id", row.id);
      stats.filtered++;
      continue;
    }
    if (dateSource === "vision_screenshot") stats.vision_used++;
    // No date resolved by either tier — do NOT insert into news_items.
    if (!publishedAt) {
      await supabase.from("news_ingestion_queue").update({
        status: "failed_no_date",
        image_url: imageUrl,
        summary,
        source_name: sourceName,
        last_error: "Date unresolved (Tier A scrape + Tier B vision both miss)",
      }).eq("id", row.id);
      noDate++;
      continue;
    }
    await supabase.from("news_ingestion_queue").update({
      status: "hydrated",
      published_at: publishedAt,
      date_source: dateSource,
      needs_date_review: needsDateReview,
      image_url: imageUrl,
      summary,
      source_name: sourceName,
      title: resolvedTitle || row.title,
      last_error: null,
    }).eq("id", row.id);
    stats.hydrated++;
  }
  (stats as any).no_date = noDate;

  // Trigger finalize for the items just hydrated
  try {
    fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/news-finalize`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      },
      body: JSON.stringify({ trigger: "hydrate" }),
    }).catch(() => {});
  } catch {}

  // Continue draining if more pending exist
  const { count } = await supabase
    .from("news_ingestion_queue")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");

  if ((count || 0) > 0) {
    try {
      fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/news-hydrate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({ trigger: "self-tick" }),
      }).catch(() => {});
    } catch {}
  }

  console.log(`[news-hydrate] batch=${pending.length} stats=${JSON.stringify(stats)} remaining=${count || 0}`);

  return new Response(JSON.stringify({
    success: true,
    batch_size: pending.length,
    ...stats,
    remaining_pending: count || 0,
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
