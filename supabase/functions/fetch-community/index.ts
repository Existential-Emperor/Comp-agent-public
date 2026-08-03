import { requireAuth } from "../_shared/auth.ts";
// fetch-community is now a thin ORCHESTRATOR. All actual community discovery
// + ingestion lives in dedicated source-specific functions:
//   - firecrawl-reddit   → Reddit posts/comments
//   - firecrawl-linkedin → LinkedIn posts/pulse articles
// Both functions use the SAME universal community quality gate
// (_shared/community-quality-scorer.ts, GPT-5, ≥20/40 threshold).
//
// This function exists so the daily cron + manual triggers have a single
// entry point. It fans out to both, returning aggregated stats.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // --- Auth guard (shared): valid user JWT or service-role key required ---
  const authError = await requireAuth(req, corsHeaders);
  if (authError) return authError;

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  let force = false;
  let targetCompetitor: string | null = null;
  let qualityThreshold = 20;
  let sources: ("reddit" | "linkedin")[] = ["reddit", "linkedin"];
  try {
    const body = await req.json();
    force = body?.force === true;
    if (typeof body?.targetCompetitor === "string" && body.targetCompetitor.trim()) {
      targetCompetitor = body.targetCompetitor.trim();
    }
    if (typeof body?.qualityThreshold === "number") qualityThreshold = body.qualityThreshold;
    if (Array.isArray(body?.sources) && body.sources.length) {
      sources = body.sources.filter((s: string) => s === "reddit" || s === "linkedin");
    }
  } catch { /* cron with no body */ }

  // Weekly guard: skip if last community fetch was < 6 days ago
  if (!force) {
    const { data: recentItems } = await supabase
      .from("news_items")
      .select("fetched_at")
      .eq("item_type", "community")
      .order("fetched_at", { ascending: false })
      .limit(1);

    if (recentItems && recentItems.length > 0) {
      const lastFetch = new Date(recentItems[0].fetched_at);
      const daysSince = (Date.now() - lastFetch.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSince < 6) {
        console.log(`fetch-community: Skipping (last fetch ${daysSince.toFixed(1)} days ago)`);
        return new Response(JSON.stringify({
          success: true,
          skipped_reason: `Last community fetch was ${daysSince.toFixed(1)} days ago. Pass { "force": true } to override.`,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }
  }

  const anonKey = serviceKey;
  const aggregated: Record<string, unknown> = { sources_invoked: sources, results: {} as Record<string, unknown> };

  // Fan out to source-specific functions sequentially.
  // Each function applies the universal quality gate internally.
  for (const source of sources) {
    const fnName = source === "reddit" ? "firecrawl-reddit" : "firecrawl-linkedin";
    try {
      console.log(`fetch-community: invoking ${fnName} (target=${targetCompetitor || "all"}, threshold=${qualityThreshold})`);
      const res = await fetch(`${supabaseUrl}/functions/v1/${fnName}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${anonKey}`,
          "apikey": anonKey,
        },
        body: JSON.stringify({
          targetCompetitor,
          applyQualityGate: true,
          qualityThreshold,
          dryRun: false,
        }),
      });
      const json = await res.json().catch(() => ({ error: "non-json response" }));
      (aggregated.results as Record<string, unknown>)[source] = { status: res.status, ...json };
    } catch (e) {
      (aggregated.results as Record<string, unknown>)[source] = { error: (e as Error).message };
    }
  }

  return new Response(JSON.stringify({ success: true, ...aggregated }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
