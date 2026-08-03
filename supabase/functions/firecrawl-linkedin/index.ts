import { requireAuth } from "../_shared/auth.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { firecrawlFetch, hasFirecrawlKey } from "../_shared/firecrawl-keys.ts";
import {
  mentionsCompetitor,
  isCommunityRelevant,
  isIrrelevantUrl,
  isLikelyEnglish,
  detectCompetitorName,
  parseDateLoose,
  TARGET_COMPETITOR_SEARCH_ALIASES,
} from "../_shared/community-rules.ts";
import { gateLinkedInItems } from "../_shared/linkedin-quality-scorer.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface LinkedInItem {
  url: string;
  title: string;
  content: string;
  estimatedDate: string | null;
  detectedCompetitor: string;
}

/**
 * Normalize a LinkedIn URL to a canonical key for dedup.
 * Strips query params/fragments and trailing slash. Lowercases host + path.
 */
function linkedinKey(url: string): string | null {
  try {
    const u = new URL(url);
    if (!u.hostname.includes("linkedin.com")) return null;
    const path = u.pathname.replace(/\/+$/, "").toLowerCase();
    return `${u.hostname.toLowerCase()}${path}`;
  } catch {
    return null;
  }
}

/**
 * Heuristic check: is this URL clearly authored/owned by a vendor company page?
 * We reject linkedin.com/company/<vendor>/ posts because those are vendor marketing,
 * not independent practitioner/user voices.
 */
const VENDOR_COMPANY_SLUGS = [
  "anaplan", "planful", "host-analytics", "pigment-app", "pigment",
  "onestream-software", "onestreamsoftware", "vena-solutions", "venasolutions",
  "datarails", "jedox", "board-international", "boardinternational",
  "prophix", "prophix-software", "workiva", "oracle", "sap", "ibm",
  "cch-tagetik", "tagetik", "workday", "kepion", "centage", "limelight-software",
];
function isVendorAuthoredUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const path = u.pathname.toLowerCase();
    // /company/<slug>/posts/... or /company/<slug>/about etc → vendor page
    const m = path.match(/^\/company\/([^\/]+)/);
    if (m && VENDOR_COMPANY_SLUGS.some((s) => m[1] === s || m[1].startsWith(s + "-"))) return true;
    // /school/<vendor>-academy/ → vendor training
    if (path.includes("/school/") && VENDOR_COMPANY_SLUGS.some((s) => path.includes(s))) return true;
    return false;
  } catch {
    return false;
  }
}

/**
 * Build the full set of LinkedIn-specific community search queries.
 * Targets posts/articles/pulse content discussing FP&A/EPM competitors.
 */
function buildLinkedInQueries(targetCompetitor: string | null): string[] {
  const queries: string[] = [];

  if (!targetCompetitor) {
    queries.push(
      // Posts — per competitor (multiple angles)
      `site:linkedin.com/posts Anaplan review experience FP&A`,
      `site:linkedin.com/posts Anaplan customer testimonial planning`,
      `site:linkedin.com/posts Anaplan connected planning use case`,
      `site:linkedin.com/posts Planful EPM customer experience`,
      `site:linkedin.com/posts OneStream implementation customer story`,
      `site:linkedin.com/posts Pigment FP&A planning customer`,
      `site:linkedin.com/posts Vena Solutions customer review`,
      `site:linkedin.com/posts Datarails FP&A customer experience`,
      `site:linkedin.com/posts Jedox EPM customer implementation`,
      `site:linkedin.com/posts Board International EPM customer`,
      `site:linkedin.com/posts Oracle EPM Cloud customer experience`,
      `site:linkedin.com/posts SAP Analytics Cloud planning customer`,
      `site:linkedin.com/posts IBM Planning Analytics TM1 customer`,
      `site:linkedin.com/posts Prophix Workiva CCH Tagetik customer`,
      `site:linkedin.com/posts Workday Adaptive Planning customer review`,
      // Pulse / articles
      `site:linkedin.com/pulse Anaplan vs Planful vs Pigment EPM`,
      `site:linkedin.com/pulse OneStream FP&A implementation lessons`,
      `site:linkedin.com/pulse choosing EPM software FP&A platform`,
      `site:linkedin.com/pulse FP&A software comparison Anaplan Pigment OneStream`,
      `site:linkedin.com/pulse EPM platform review experience`,
      // Switching / migration / sentiment
      `site:linkedin.com "switched from" OR "migrated from" Anaplan OR Planful OR Pigment OR OneStream`,
      `site:linkedin.com "moving from" OR "moved from" Anaplan OR Oracle EPM OR SAP Analytics`,
      `site:linkedin.com "implementation" "lessons learned" Anaplan OR Planful OR OneStream OR Pigment`,
      `site:linkedin.com "go live" OR "went live" Anaplan OR Planful OR OneStream`,
      `site:linkedin.com "honest review" OR "honest opinion" Anaplan OR Planful OR Pigment OR OneStream`,
      `site:linkedin.com "pros and cons" Anaplan OR Planful OR Pigment OR OneStream OR Vena`,
      // Specific competitors deeper
      `site:linkedin.com Anaplan customer story implementation case study`,
      `site:linkedin.com Planful customer story implementation case study`,
      `site:linkedin.com OneStream customer story implementation case study`,
      `site:linkedin.com Pigment customer story implementation case study`,
      `site:linkedin.com Vena Solutions customer story case study`,
      `site:linkedin.com Datarails customer story FP&A`,
      `site:linkedin.com Jedox customer story EPM`,
      `site:linkedin.com Board International customer story EPM`,
      `site:linkedin.com Oracle EPM Cloud customer story implementation`,
      `site:linkedin.com SAP Analytics Cloud customer story planning`,
      `site:linkedin.com IBM Planning Analytics customer story`,
      `site:linkedin.com CCH Tagetik customer story EPM`,
      `site:linkedin.com Workday Adaptive Planning customer story`,
      // Community discussion patterns
      `site:linkedin.com "we use" Anaplan OR Planful OR OneStream OR Pigment FP&A`,
      `site:linkedin.com "we chose" Anaplan OR Planful OR OneStream OR Pigment EPM`,
      `site:linkedin.com "thoughts on" Anaplan OR Planful OR Pigment OR OneStream`,
      `site:linkedin.com "anyone using" OR "anyone tried" Anaplan OR Planful OR Pigment OR OneStream`,
      `site:linkedin.com "feedback on" Anaplan OR Planful OR Pigment OR OneStream OR Vena`,
      `site:linkedin.com "comparing" Anaplan Planful Pigment OneStream Vena`,
      `site:linkedin.com "evaluating" EPM FP&A Anaplan Planful OneStream Pigment`,
      `site:linkedin.com "shortlist" EPM FP&A Anaplan Planful OneStream Pigment`,
      // Conferences / events / releases
      `site:linkedin.com Anaplan Connect conference takeaways`,
      `site:linkedin.com OneStream Splash conference takeaways`,
      `site:linkedin.com Pigment "Now & Next" conference takeaways`,
      `site:linkedin.com Planful Perform conference takeaways`,
      `site:linkedin.com Vena Excelerate conference takeaways`,
      // Practitioner/consultant patterns
      `site:linkedin.com/posts FP&A practitioner Anaplan Planful OneStream Pigment`,
      `site:linkedin.com/posts EPM consultant Anaplan Planful OneStream`,
      `site:linkedin.com/posts CFO perspective Anaplan Planful Pigment OneStream`,
      `site:linkedin.com/posts finance transformation Anaplan Pigment Planful OneStream`,
      `site:linkedin.com/posts xP&A Anaplan Pigment OneStream Planful`,
      // Pulse extras
      `site:linkedin.com/pulse Anaplan migration replacement experience`,
      `site:linkedin.com/pulse Pigment vs Anaplan FP&A`,
      `site:linkedin.com/pulse OneStream vs Anaplan EPM`,
      `site:linkedin.com/pulse Workday Adaptive Planning vs Anaplan`,
      `site:linkedin.com/pulse Vena vs Datarails FP&A spreadsheet`,
      `site:linkedin.com/pulse Oracle EPM Cloud vs SAP Analytics Cloud`,
      `site:linkedin.com/pulse choosing FP&A platform 2025 2026`,
      `site:linkedin.com/pulse EPM RFP selection criteria`,
      `site:linkedin.com/pulse FP&A software trends 2025`,
      // Long-form sentiment
      `site:linkedin.com "love" OR "hate" Anaplan OR Planful OR Pigment OR OneStream FP&A`,
      `site:linkedin.com "frustrated with" Anaplan OR Planful OR OneStream OR Oracle EPM OR SAP Analytics`,
      `site:linkedin.com "biggest challenge" Anaplan OR Planful OR OneStream OR Pigment implementation`,
      `site:linkedin.com "lesson learned" Anaplan OR Planful OR OneStream OR Pigment`,
      `site:linkedin.com "would recommend" OR "would not recommend" Anaplan OR Planful OR OneStream OR Pigment`,
      // Competitor-specific deep dives
      `site:linkedin.com Anaplan Polaris hyperblock model performance`,
      `site:linkedin.com Pigment AI copilot finance`,
      `site:linkedin.com OneStream sensible ML extensible dimensionality`,
      `site:linkedin.com Vena Excel native FP&A`,
      `site:linkedin.com Datarails FP&A genius copilot`,
      `site:linkedin.com Workday Adaptive Planning vs spreadsheet`,
      `site:linkedin.com Oracle EPM Cloud Narrative Reporting Strategic Modeling`,
      `site:linkedin.com SAP Analytics Cloud planning predictive`,
      `site:linkedin.com IBM Planning Analytics TM1 Workspace`,
      `site:linkedin.com CCH Tagetik consolidation planning`,
      `site:linkedin.com Board International integrated business planning`,
      `site:linkedin.com Jedox AIssisted planning`,
      `site:linkedin.com Prophix One platform FP&A`,
      `site:linkedin.com Workiva connected reporting EPM`,
    );
  }

  if (targetCompetitor) {
    const searchAliases = TARGET_COMPETITOR_SEARCH_ALIASES[targetCompetitor] || [targetCompetitor];
    for (const alias of searchAliases) {
      queries.push(
        `site:linkedin.com/posts "${alias}" review experience`,
        `site:linkedin.com/posts "${alias}" customer story implementation`,
        `site:linkedin.com/pulse "${alias}" comparison FP&A EPM`,
        `site:linkedin.com "${alias}" "lessons learned" implementation`,
        `site:linkedin.com "switched from" OR "migrated from" "${alias}"`,
        `site:linkedin.com "${alias}" pros cons honest review`,
        `site:linkedin.com "${alias}" customer experience case study`,
        `site:linkedin.com "we use" OR "we chose" "${alias}"`,
      );
    }
  }

  return queries;
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
  let dryRun = false;
  let maxResults = 200;
  let applyQualityGate = true;
  let qualityThreshold = 20;
  let queryStart: number | null = null;
  let queryEnd: number | null = null;
  let scoreItems: LinkedInItem[] | null = null;
  let scoreCount = 100;
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
    if (typeof body?.queryStart === "number") queryStart = body.queryStart;
    if (typeof body?.queryEnd === "number") queryEnd = body.queryEnd;
    if (Array.isArray(body?.scoreItems)) scoreItems = body.scoreItems;
    if (typeof body?.scoreCount === "number") scoreCount = body.scoreCount;
  } catch {
    // ignore body parsing errors (cron with no body)
  }

  // SCORE-ONLY MODE: skip discovery, score caller-supplied raw items
  if (scoreItems && scoreItems.length > 0) {
    console.log(`firecrawl-linkedin (score-only): scoring ${scoreItems.length} items at threshold=${qualityThreshold}/40`);
    const { scored, passing } = await gateLinkedInItems(scoreItems, { threshold: qualityThreshold, count: scoreCount });
    return new Response(JSON.stringify({
      success: true,
      mode: "score-only",
      totalScored: scored.length,
      passing: passing.length,
      threshold: qualityThreshold,
      items: passing,
      scoredDebug: scored.map((s) => ({ url: s.url, total: s.scores.total, scores: s.scores })),
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  // Existing LinkedIn URLs for dedup
  const { data: existingRows } = await supabase
    .from("news_items")
    .select("source_url")
    .ilike("source_url", "%linkedin.com%");
  const existingKeys = new Set<string>();
  const existingUrls = new Set<string>();
  for (const r of existingRows || []) {
    existingUrls.add(r.source_url);
    const k = linkedinKey(r.source_url);
    if (k) existingKeys.add(k);
  }

  const allQueries = buildLinkedInQueries(targetCompetitor);
  const sliceStart = queryStart ?? 0;
  const sliceEnd = queryEnd ?? allQueries.length;
  const queries = allQueries.slice(sliceStart, sliceEnd);
  console.log(`firecrawl-linkedin: Running ${queries.length}/${allQueries.length} queries [${sliceStart}..${sliceEnd}] (target: ${targetCompetitor || "all"}, dryRun: ${dryRun})`);

  const seenKeys = new Set<string>();
  const seenUrls = new Set<string>();
  const rawItems: LinkedInItem[] = [];
  const stats = {
    totalSearchResults: 0,
    skippedNotLinkedIn: 0,
    skippedNoCompetitor: 0,
    skippedIrrelevant: 0,
    skippedNotEnglish: 0,
    skippedExisting: 0,
    skippedDupe: 0,
    skippedNotRelevant: 0,
    errors: [] as string[],
  };

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
      }, "firecrawl-linkedin");

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

        // Must be linkedin.com
        if (!url.includes("linkedin.com")) {
          stats.skippedNotLinkedIn++;
          continue;
        }

        // Dedup by canonical key
        const key = linkedinKey(url);
        if (key) {
          if (seenKeys.has(key) || existingKeys.has(key)) {
            stats.skippedDupe++;
            continue;
          }
          seenKeys.add(key);
        } else if (seenUrls.has(url) || existingUrls.has(url)) {
          stats.skippedDupe++;
          continue;
        }
        seenUrls.add(url);

        if (isIrrelevantUrl(url) || isVendorAuthoredUrl(url)) {
          stats.skippedIrrelevant++;
          continue;
        }

        if (!mentionsCompetitor(title, content)) {
          stats.skippedNoCompetitor++;
          continue;
        }

        if (!isLikelyEnglish(title, content)) {
          stats.skippedNotEnglish++;
          continue;
        }

        if (!isCommunityRelevant(title, content)) {
          stats.skippedNotRelevant++;
          continue;
        }

        const publishedAt = parseDateLoose(r.publishedDate || r.published_date || r.date) || null;

        rawItems.push({
          url,
          title,
          content: content.slice(0, 2000),
          estimatedDate: publishedAt,
          detectedCompetitor: detectCompetitorName(title, content),
        });

        if (rawItems.length >= maxResults) break;
      }

      if (i < queries.length - 1 && rawItems.length < maxResults) {
        await new Promise((r) => setTimeout(r, 500));
      }
    } catch (e) {
      stats.errors.push(`Query ${i + 1} error: ${(e as Error).message}`);
    }
  }

  console.log(`firecrawl-linkedin complete: ${rawItems.length} items found. Stats: ${JSON.stringify(stats)}`);

  let itemsToInsert: any[] = rawItems;
  let gateStats: { scored: number; passing: number; rejected: number; threshold: number } | null = null;
  if (applyQualityGate && rawItems.length > 0) {
    console.log(`firecrawl-linkedin: applying quality gate (threshold=${qualityThreshold}/40) to ${rawItems.length} items`);
    const { scored, passing } = await gateLinkedInItems(rawItems, { threshold: qualityThreshold });
    gateStats = { scored: scored.length, passing: passing.length, rejected: scored.length - passing.length, threshold: qualityThreshold };
    console.log(`firecrawl-linkedin: quality gate ${passing.length}/${scored.length} passed (rejected ${gateStats.rejected})`);
    itemsToInsert = passing;
  }

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
        // ignore
      }
    }
    console.log(`firecrawl-linkedin: inserted ${inserted} quality-gated community items`);
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
// rebuild 1776408334
// rebuild 1776408403
