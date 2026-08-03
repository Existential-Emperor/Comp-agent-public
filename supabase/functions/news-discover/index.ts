import { requireAuth } from "../_shared/auth.ts";
// Stage 1 of the news pipeline.
// Uses Firecrawl /v2/search (with tbs=qdr:w for last-week recency) per
// competitor query, filters URLs, enqueues survivors into news_ingestion_queue.
// NO insertion into news_items (that's news-finalize's job).
//
// Replaces the previous Anthropic web search flow. Anthropic was returning
// thin/empty results for the past two weeks; Firecrawl /v2/search is the
// discovery source going forward.
//
// Filter chain mirrors news-discover-firecrawl-probe + the manual review
// learnings (publication homepages, survey/PR thought-leadership, earnings
// scheduling, brand collisions like Vena Energy / Pigment cosmetics).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { firecrawlFetch, hasFirecrawlKey } from "../_shared/firecrawl-keys.ts";
import {
  COMPETITOR_NAMES,
  classifyGenre,
  detectCompetitorName,
  ensureCompetitorNamesLoaded,
  isIrrelevantUrl,
  isLikelyEnglish,
  isListingPage,
  isNewsRelevant,
  isOfficialCompetitorSocial,
  isProductRelevant,
  isPublicationHomepage,
  isSocialMedia,
  mentionsCompetitor,
} from "../_shared/news-queue.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Per-competitor queries. Tight phrases beat broad combinatorial queries —
// Firecrawl returns tighter SERPs with vendor-specific language.
const PER_COMPETITOR_QUERIES: Record<string, string> = {
  "Anaplan": "Anaplan product update OR release OR launch",
  "Pigment": "Pigment business planning product release",
  "Planful": "Planful product update OR release",
  "OneStream": "OneStream product update OR release",
  "Jedox": "Jedox product update OR release",
  "Vena Solutions": "Vena Solutions product update OR release",
  "Oracle EPM": "Oracle EPM Cloud release update",
  "SAP Analytics Cloud": "SAP Analytics Cloud release update",
  "Workday Adaptive Planning": "Workday Adaptive Planning release update",
  "Datarails": "Datarails product announcement",
  "Board International": "Board International product update",
  "Prophix": "Prophix product update",
  "Workiva": "Workiva product announcement",
  "IBM Planning Analytics": "IBM Planning Analytics release update",
  "Wolters Kluwer CCH Tagetik": "CCH Tagetik product update OR release",
};

function buildQueries(targetCompetitor: string | null): { competitor: string; query: string }[] {
  if (targetCompetitor) {
    const q = PER_COMPETITOR_QUERIES[targetCompetitor]
      || `"${targetCompetitor}" product update OR release OR launch`;
    return [{ competitor: targetCompetitor, query: q }];
  }
  return Object.entries(PER_COMPETITOR_QUERIES).map(([competitor, query]) => ({ competitor, query }));
}

function normalizeUrl(u: string): string {
  try {
    const url = new URL(u);
    url.hash = "";
    url.search = "";
    return url.toString().replace(/\/$/, "").toLowerCase();
  } catch { return u.toLowerCase(); }
}

type Hit = {
  query: string;
  competitor_hint: string;
  url: string;
  title: string;
  description: string;
};

async function firecrawlSearch(query: string): Promise<Omit<Hit, "query" | "competitor_hint">[]> {
  console.log(`[news-discover] firecrawl search: ${query}`);
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 25000);
    const res = await firecrawlFetch("https://api.firecrawl.dev/v2/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query,
        limit: 10,
        tbs: "qdr:w", // last week recency filter
        sources: ["web", "news"],
      }),
      signal: ctrl.signal,
    }, "news-discover");
    clearTimeout(timer);
    if (!res.ok) {
      console.warn(`[news-discover] firecrawl search ${res.status} for "${query.slice(0, 40)}"`);
      await res.text().catch(() => "");
      return [];
    }
    const json = await res.json().catch(() => ({}));
    const items: any[] = [
      ...(Array.isArray(json?.data?.web) ? json.data.web : []),
      ...(Array.isArray(json?.data?.news) ? json.data.news : []),
    ];
    return items
      .map((it) => ({
        url: it.url || it.link || "",
        title: it.title || "",
        description: it.description || it.snippet || "",
      }))
      .filter((h) => !!h.url);
  } catch (e) {
    console.warn(`[news-discover] firecrawl search error: ${(e as Error).message}`);
    return [];
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // --- Auth guard (shared): valid user JWT or service-role key required ---
  const authError = await requireAuth(req, corsHeaders);
  if (authError) return authError;

  if (!hasFirecrawlKey()) {
    return new Response(
      JSON.stringify({ error: "FIRECRAWL_API_KEY not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  await ensureCompetitorNamesLoaded();

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let targetCompetitor: string | null = null;
  try {
    const body = await req.json();
    if (typeof body?.targetCompetitor === "string" && body.targetCompetitor.trim()) {
      const normalized = detectCompetitorName(body.targetCompetitor);
      targetCompetitor = normalized === "Other" ? body.targetCompetitor.trim() : normalized;
    }
  } catch { /* no body */ }

  const runId = crypto.randomUUID();
  const queries = buildQueries(targetCompetitor);

  // Existing URLs (news_items + queue) to skip duplicates.
  const [{ data: existingNews }, { data: existingQueue }] = await Promise.all([
    supabase.from("news_items").select("source_url"),
    supabase.from("news_ingestion_queue").select("source_url"),
  ]);
  const seenUrls = new Set<string>([
    ...(existingNews || []).map((r: any) => normalizeUrl(r.source_url)),
    ...(existingQueue || []).map((r: any) => normalizeUrl(r.source_url)),
  ]);

  const stats = {
    run_id: runId,
    discovery_source: "firecrawl_v2_search",
    queries_run: 0,
    discovered: 0,
    enqueued: 0,
    skipped_duplicate: 0,
    skipped_filter: 0,
    skip_reasons: {} as Record<string, number>,
    errors: [] as string[],
  };
  const bumpReason = (r: string) => { stats.skip_reasons[r] = (stats.skip_reasons[r] ?? 0) + 1; };

  const toEnqueue: { competitor_name: string; source_url: string; title: string; snippet: string }[] = [];

  for (const { competitor, query } of queries) {
    try {
      const items = await firecrawlSearch(query);
      stats.queries_run++;
      stats.discovered += items.length;

      for (const r of items) {
        const norm = normalizeUrl(r.url);
        const logSkip = (reason: string) => {
          stats.skipped_filter++;
          bumpReason(reason);
          console.log(`[news-discover] SKIP ${reason} | ${r.url} | ${(r.title || "").slice(0, 120)}`);
        };

        if (seenUrls.has(norm)) { stats.skipped_duplicate++; bumpReason("duplicate"); continue; }
        // Layer 1 — structural: is this a single article at all?
        if (isIrrelevantUrl(r.url)) { logSkip("irrelevant_url"); continue; }
        if (isPublicationHomepage(r.url)) { logSkip("publication_homepage"); continue; }
        if (isOfficialCompetitorSocial(r.url)) { logSkip("official_social"); continue; }
        if (isSocialMedia(r.url)) { logSkip("social_media"); continue; }
        if (isListingPage(r.url, r.title)) { logSkip("listing_page"); continue; }
        if (!isNewsRelevant(r.title, r.url)) { logSkip("not_news_relevant"); continue; }
        // Layer 2 — identity: whole-word competitor mention.
        if (!mentionsCompetitor(r.title, r.description)) { logSkip("no_competitor_mention"); continue; }
        // Layer 3 — locale.
        if (!isLikelyEnglish(r.title, r.description)) { logSkip("not_english"); continue; }
        // Layer 4 — genre: only product/strategy news passes.
        const genre = classifyGenre(r.title, r.description);
        if (genre !== "product") { logSkip(`genre_${genre}`); continue; }
        // Layer 5 — substance: strong product signal near competitor mention.
        if (!isProductRelevant(r.title, r.description)) { logSkip("not_product_relevant"); continue; }

        seenUrls.add(norm);
        // Prefer competitor detected from text; fall back to query hint.
        const detected = detectCompetitorName(r.title, r.description);
        const competitor_name = detected === "Other" ? competitor : detected;
        toEnqueue.push({
          competitor_name,
          source_url: r.url,
          title: r.title || "Untitled",
          snippet: (r.description || "").slice(0, 800),
        });
      }
    } catch (e) {
      console.error("[news-discover] query failed:", e);
      stats.errors.push(`Query "${query.slice(0, 60)}": ${(e as Error).message}`);
    }
  }

  if (toEnqueue.length > 0) {
    const rows = toEnqueue.map((c) => ({
      run_id: runId,
      competitor_name: c.competitor_name,
      source_url: c.source_url,
      title: c.title,
      snippet: c.snippet,
      status: "pending",
      metadata: { discovered_via: "firecrawl_search" },
    }));
    const { data: inserted, error } = await supabase
      .from("news_ingestion_queue")
      .upsert(rows, { onConflict: "source_url", ignoreDuplicates: true })
      .select("id");
    if (error) {
      console.error("[news-discover] enqueue error:", error.message);
      stats.errors.push(`enqueue: ${error.message}`);
    } else {
      stats.enqueued = inserted?.length || 0;
    }
  }

  console.log(`[news-discover] run=${runId} stats=${JSON.stringify(stats)}`);

  // Fire-and-forget hydrate kick so the queue starts draining immediately.
  if (stats.enqueued > 0) {
    try {
      const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/news-hydrate`;
      fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({ trigger: "discover" }),
      }).catch((e) => console.warn("[news-discover] hydrate kick failed:", e?.message));
    } catch {}
  }

  return new Response(
    JSON.stringify({ success: true, ...stats, competitors_in_scope: COMPETITOR_NAMES.length }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
