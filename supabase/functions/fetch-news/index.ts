import { requireAuth } from "../_shared/auth.ts";
// =====================================================================
// fetch-news — THIN ORCHESTRATOR (legacy monolith fully retired)
// ---------------------------------------------------------------------
// This function is the cron entry point only. It exists so the existing
// `fetch-news-daily` schedule and any external callers keep working.
// It does NOT scrape, hydrate, or insert anything itself.
//
// Pipeline:
//   Stage 1  news-discover   — Anthropic search + filter + enqueue
//   Stage 2  news-hydrate    — Firecrawl scrape (Tier A) → vision fallback
//                              (Tier B) → discovered_at fallback (Tier C);
//                              guarantees published_at is never null
//   Stage 3  news-finalize   — atomic claim + insert into news_items
//
// Legacy responsibilities migrated:
//   - Firecrawl scraping & image hydration → news-hydrate
//   - Date verification / verify-dates loop → news-hydrate (Tiers A/B/C)
//   - Source-name sweeps & row backfills    → news-hydrate
//   - 300-row range backfill                → no longer needed (queue is FIFO)
// =====================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // --- Auth guard (shared): valid user JWT or service-role key required ---
  const authError = await requireAuth(req, corsHeaders);
  if (authError) return authError;

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  if (!Deno.env.get("ANTHROPIC_API_KEY")) {
    return new Response(JSON.stringify({ success: false, error: "ANTHROPIC_API_KEY is not set" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let force = false;
  let targetCompetitor: string | null = null;
  try {
    const body = await req.json();
    force = body?.force === true;
    if (typeof body?.targetCompetitor === "string") targetCompetitor = body.targetCompetitor.trim() || null;
  } catch { /* no body */ }

  // Scoped freshness guard: news rows only
  let hoursSinceLast: number | null = null;
  const { data: recent } = await supabase
    .from("news_items")
    .select("fetched_at")
    .eq("item_type", "news")
    .order("fetched_at", { ascending: false })
    .limit(1);
  if (recent && recent.length > 0) {
    hoursSinceLast = (Date.now() - new Date(recent[0].fetched_at).getTime()) / 3600000;
  }

  // Loose run window: 00:00 UTC, OR last fetch > 20h ago / never, OR forced
  if (!force) {
    const utcHour = new Date().getUTCHours();
    const stale = hoursSinceLast === null || hoursSinceLast > 20;
    if (utcHour !== 0 && !stale) {
      const reason = `Outside daily window and last news fetch was ${hoursSinceLast?.toFixed(1) ?? "?"}h ago. Pass { "force": true } to override.`;
      console.log(`[fetch-news] skipping: ${reason}`);
      return new Response(JSON.stringify({ success: true, skipped_reason: reason }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  // 23h hard guard
  if (!force && hoursSinceLast !== null && hoursSinceLast < 23) {
    const reason = `Last news fetch was ${hoursSinceLast.toFixed(1)}h ago. Pass { "force": true } to override.`;
    console.log(`[fetch-news] skipping: ${reason}`);
    return new Response(JSON.stringify({ success: true, skipped_reason: reason }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Trigger Stage 1 (discovery). It will kick the hydrate ticker on its own.
  console.log(`[fetch-news] triggering news-discover (target=${targetCompetitor ?? "all"})`);
  const discoverRes = await fetch(`${supabaseUrl}/functions/v1/news-discover`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${serviceKey}`,
    },
    body: JSON.stringify(targetCompetitor ? { targetCompetitor } : {}),
  });

  const discoverPayload = await discoverRes.json().catch(() => ({}));

  return new Response(JSON.stringify({
    success: discoverRes.ok,
    stage: "discover",
    discover: discoverPayload,
    note: "Hydrate stage runs asynchronously via cron + self-ticks. Check news_ingestion_queue for progress.",
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
