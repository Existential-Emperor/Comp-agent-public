import { requireAuth } from "../_shared/auth.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { firecrawlFetch, hasFirecrawlKey } from "../_shared/firecrawl-keys.ts";
import {
  mentionsCompetitor,
  isCommunityRelevant,
  isIrrelevantUrl,
  isLikelyEnglish,
  detectCompetitorName,
  estimateRedditDate,
  parseDateLoose,
  buildRedditQueries,
} from "../_shared/community-rules.ts";
import { gateRedditItems } from "../_shared/reddit-quality-scorer.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface RedditItem {
  url: string;
  title: string;
  content: string;
  estimatedDate: string | null;
  detectedCompetitor: string;
}

/**
 * Normalize a Reddit URL to its canonical post/comment ID for dedup.
 * Extracts the base36 post ID from /comments/<id> patterns.
 */
function redditPostId(url: string): string | null {
  const m = url.match(/reddit\.com\/r\/\w+\/comments\/([a-z0-9]+)/i);
  return m ? m[1].toLowerCase() : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // --- Auth guard (shared): valid user JWT or service-role key required ---
  const authError = await requireAuth(req, corsHeaders);
  if (authError) return authError;

  if (!hasFirecrawlKey()) {
    return new Response(
      JSON.stringify({ success: false, error: "No Firecrawl API keys configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  let targetCompetitor: string | null = null;
  let dryRun = false; // default to live insertion
  let maxResults = 200;
  let applyQualityGate = true; // default ON for daily cron
  let qualityThreshold = 20; // 20/40 minimum
  try {
    const body = await req.json();
    if (typeof body?.targetCompetitor === "string" && body.targetCompetitor.trim()) {
      targetCompetitor = detectCompetitorName(body.targetCompetitor, body.targetCompetitor);
      if (targetCompetitor === "Other") targetCompetitor = body.targetCompetitor.trim();
    }
    if (body?.dryRun === true) dryRun = true;
    if (typeof body?.maxResults === "number") maxResults = body.maxResults;
    if (body?.applyQualityGate === false) applyQualityGate = false;
    if (typeof body?.qualityThreshold === "number") qualityThreshold = body.qualityThreshold;
  } catch {
    // Ignore body parsing errors (e.g. cron calls with no body)
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  // Get existing Reddit URLs for dedup — use post IDs for robust matching
  const { data: existingRows } = await supabase
    .from("news_items")
    .select("source_url")
    .ilike("source_url", "%reddit.com%");
  const existingPostIds = new Set<string>();
  const existingUrls = new Set<string>();
  for (const r of existingRows || []) {
    existingUrls.add(r.source_url);
    const pid = redditPostId(r.source_url);
    if (pid) existingPostIds.add(pid);
  }

  const queries = buildRedditQueries(targetCompetitor);
  console.log(`firecrawl-reddit: Running ${queries.length} queries (target: ${targetCompetitor || "all"}, dryRun: ${dryRun})`);

  const seenPostIds = new Set<string>();
  const seenUrls = new Set<string>();
  const rawItems: RedditItem[] = [];
  const stats = { totalSearchResults: 0, skippedNotReddit: 0, skippedNoCompetitor: 0, skippedIrrelevant: 0, skippedNotEnglish: 0, skippedExisting: 0, skippedDupe: 0, skippedNotRelevant: 0, skippedDateRange: 0, errors: [] as string[] };

  for (let i = 0; i < queries.length; i++) {
    const query = queries[i];
    if (rawItems.length >= maxResults) break;

    try {
      console.log(`[${i + 1}/${queries.length}] Searching: ${query.slice(0, 80)}...`);

      const response = await firecrawlFetch("https://api.firecrawl.dev/v1/search", {
        method: "POST",
        body: JSON.stringify({
          query,
          limit: 10,
          scrapeOptions: { formats: ["markdown"] },
        }),
      }, "firecrawl-reddit");

      if (!response.ok) {
        const errText = await response.text();
        console.error(`Search error ${response.status}: ${errText.slice(0, 200)}`);
        stats.errors.push(`Query ${i + 1} failed: ${response.status}`);
        continue;
      }

      const data = await response.json();
      const results = data.data || data.results || [];
      stats.totalSearchResults += results.length;

      for (const r of results) {
        const url = r.url || "";
        const title = r.title || r.metadata?.title || "";
        const content = r.markdown || r.content || r.description || "";

        // Must be reddit.com
        if (!url.includes("reddit.com")) {
          stats.skippedNotReddit++;
          continue;
        }

        // Dedup by post ID (robust) and URL (fallback)
        const pid = redditPostId(url);
        if (pid) {
          if (seenPostIds.has(pid) || existingPostIds.has(pid)) {
            stats.skippedDupe++;
            continue;
          }
          seenPostIds.add(pid);
        } else if (seenUrls.has(url) || existingUrls.has(url)) {
          stats.skippedDupe++;
          continue;
        }
        seenUrls.add(url);

        // Irrelevant URL patterns
        if (isIrrelevantUrl(url)) {
          stats.skippedIrrelevant++;
          continue;
        }

        // Must mention a competitor
        if (!mentionsCompetitor(title, content)) {
          stats.skippedNoCompetitor++;
          continue;
        }

        // English only
        if (!isLikelyEnglish(title, content)) {
          stats.skippedNotEnglish++;
          continue;
        }

        // Community relevance
        if (!isCommunityRelevant(title, content)) {
          stats.skippedNotRelevant++;
          continue;
        }

        // Estimate date and enforce 365-day window
        const redditDate = estimateRedditDate(url);
        const publishedAt = redditDate || parseDateLoose(r.publishedDate || r.published_date || r.date) || null;

        if (publishedAt) {
          const dateObj = new Date(publishedAt);
          const oneYearAgo = new Date(Date.now() - 365 * 86400000);
          if (dateObj < oneYearAgo || dateObj.getTime() > Date.now() + 86400000) {
            stats.skippedDateRange++;
            continue;
          }
        }

        rawItems.push({
          url,
          title,
          content: content.slice(0, 2000),
          estimatedDate: publishedAt,
          detectedCompetitor: detectCompetitorName(title, content),
        });

        if (rawItems.length >= maxResults) break;
      }

      // Small delay between queries
      if (i < queries.length - 1 && rawItems.length < maxResults) {
        await new Promise((r) => setTimeout(r, 500));
      }
    } catch (e) {
      stats.errors.push(`Query ${i + 1} error: ${(e as Error).message}`);
    }
  }

  console.log(`firecrawl-reddit complete: ${rawItems.length} items found. Stats: ${JSON.stringify(stats)}`);

  // Apply AI quality gate before insertion
  let itemsToInsert: any[] = rawItems;
  let gateStats: { scored: number; passing: number; rejected: number; threshold: number } | null = null;
  if (applyQualityGate && rawItems.length > 0) {
    console.log(`firecrawl-reddit: applying quality gate (threshold=${qualityThreshold}/40) to ${rawItems.length} items`);
    const { scored, passing } = await gateRedditItems(rawItems, { threshold: qualityThreshold });
    gateStats = { scored: scored.length, passing: passing.length, rejected: scored.length - passing.length, threshold: qualityThreshold };
    console.log(`firecrawl-reddit: quality gate ${passing.length}/${scored.length} passed (rejected ${gateStats.rejected})`);
    itemsToInsert = passing;
  }

  // Insert into DB (unless dry run)
  let inserted = 0;
  if (!dryRun) {
    for (const item of itemsToInsert) {
      try {
        const { error } = await supabase.from("news_items").insert({
          title: item.title || "Untitled",
          summary: item.content.slice(0, 500) || null,
          source_url: item.url,
          source_name: item.detectedCompetitor,
          image_url: null,
          item_type: "community",
          published_at: item.estimatedDate || null,
          fetched_at: new Date().toISOString(),
        });
        if (!error) inserted++;
        else console.error(`Insert error for ${item.url}: ${error.message}`);
      } catch {
        // Ignore
      }
    }
    console.log(`firecrawl-reddit: inserted ${inserted} quality-gated community items`);
  }

  return new Response(JSON.stringify({
    success: true,
    dryRun,
    totalItems: rawItems.length,
    qualityGate: gateStats,
    inserted,
    stats,
    ...(dryRun ? { items: itemsToInsert } : {}),
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
