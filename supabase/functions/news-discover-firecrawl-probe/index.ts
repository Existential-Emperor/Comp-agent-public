import { requireAuth } from "../_shared/auth.ts";
// One-off probe: discover last-week news via Firecrawl /v2/search and apply
// the same news-discover filters, returning only the survivors.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { firecrawlFetch, hasFirecrawlKey } from "../_shared/firecrawl-keys.ts";
import {
  ensureCompetitorNamesLoaded,
  classifyGenre,
  detectCompetitorName,
  isIrrelevantUrl,
  isLikelyEnglish,
  isListingPage,
  isNewsRelevant,
  isOfficialCompetitorSocial,
  isProductRelevant,
  isSocialMedia,
  mentionsCompetitor,
} from "../_shared/news-queue.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const QUERIES = [
  "Anaplan product update OR release OR launch",
  "Pigment business planning product release",
  "Planful product update OR release",
  "OneStream product update OR release",
  "Jedox product update OR release",
  "Vena Solutions product update OR release",
  "Oracle EPM Cloud release update",
  "SAP Analytics Cloud release update",
  "Workday Adaptive Planning release update",
  "Datarails product announcement",
  "Board International product update",
  "Prophix product update",
  "Workiva product announcement",
];

function normalizeUrl(u: string): string {
  try {
    const url = new URL(u);
    url.hash = "";
    url.search = "";
    return url.toString().replace(/\/$/, "").toLowerCase();
  } catch { return u.toLowerCase(); }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // --- Auth guard (shared): valid user JWT or service-role key required ---
  const authError = await requireAuth(req, corsHeaders);
  if (authError) return authError;
  if (!hasFirecrawlKey()) {
    return new Response(JSON.stringify({ error: "no firecrawl key" }), { status: 500, headers: corsHeaders });
  }

  const url = new URL(req.url);
  const ignoreKnown = url.searchParams.get("ignoreKnown") === "1";

  await ensureCompetitorNamesLoaded();

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const known = new Set<string>();
  if (!ignoreKnown) {
    const { data: existing } = await supabase.from("news_items").select("source_url").limit(5000);
    const { data: queued } = await supabase.from("news_ingestion_queue").select("source_url").limit(5000);
    for (const r of (existing ?? [])) known.add(normalizeUrl((r as any).source_url));
    for (const r of (queued ?? [])) known.add(normalizeUrl((r as any).source_url));
  }

  type Hit = { query: string; url: string; title: string; description: string; date?: string };
  const allHits: Hit[] = [];

  for (const q of QUERIES) {
    try {
      const res = await firecrawlFetch("https://api.firecrawl.dev/v2/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q, limit: 10, tbs: "qdr:w", sources: ["web", "news"] }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) continue;
      const items: any[] = [...(json?.data?.web ?? []), ...(json?.data?.news ?? [])];
      for (const it of items) {
        const url = it.url || it.link;
        if (!url) continue;
        allHits.push({
          query: q,
          url,
          title: it.title || "",
          description: it.description || it.snippet || "",
          date: it.date || it.publishedDate || it.published_at,
        });
      }
    } catch { /* skip */ }
  }

  // Apply filters
  const reasons: Record<string, number> = {};
  const survivors: (Hit & { competitor: string })[] = [];
  const seen = new Set<string>();

  for (const h of allHits) {
    const norm = normalizeUrl(h.url);
    const skip = (r: string) => { reasons[r] = (reasons[r] ?? 0) + 1; };

    if (seen.has(norm)) { skip("dup_in_batch"); continue; }
    seen.add(norm);

    if (known.has(norm)) { skip("duplicate_db"); continue; }
    if (isIrrelevantUrl(h.url)) { skip("irrelevant_url"); continue; }
    if (isSocialMedia(h.url) && !isOfficialCompetitorSocial(h.url)) { skip("social_media"); continue; }
    if (isListingPage(h.url, h.title)) { skip("listing_page"); continue; }
    if (!isNewsRelevant(h.title, h.url)) { skip("not_news_relevant"); continue; }

    // Identity (whole-word)
    const competitor = detectCompetitorName(h.title, h.description);
    if (!competitor) { skip("no_competitor_mention"); continue; }
    if (!mentionsCompetitor(h.title, h.description)) { skip("no_competitor_mention"); continue; }

    // Locale
    if (!isLikelyEnglish(h.title, h.description)) { skip("not_english"); continue; }

    // Genre
    const genre = classifyGenre(h.title, h.description);
    if (genre !== "product") { skip(`genre_${genre}`); continue; }

    // Substance proximity
    if (!isProductRelevant(h.title, h.description)) { skip("not_product_relevant"); continue; }

    survivors.push({ ...h, competitor });
  }

  return new Response(JSON.stringify({
    success: true,
    raw_hits: allHits.length,
    survivors_count: survivors.length,
    skip_reasons: reasons,
    survivors,
  }, null, 2), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
