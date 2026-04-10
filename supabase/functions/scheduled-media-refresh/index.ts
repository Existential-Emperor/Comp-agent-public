import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Scheduled (96h cron) media refresh for the 6 key competitors.
 * Only adds NEW media — if a crawl finds nothing new, the competitor is skipped.
 * Then persists any non-permanent CDN URLs to Supabase storage.
 */

const PRIORITY_COMPETITORS = ["OneStream", "Anaplan", "Planful", "Oracle EPM", "SAP", "Pigment"];

const NAME_VARIANTS: Record<string, string[]> = {
  "OneStream": ["OneStream", "OneStream XF", "OneStream Software"],
  "Anaplan": ["Anaplan"],
  "Planful": ["Planful"],
  "Oracle EPM": ["Oracle EPM", "Oracle EPM Cloud", "Oracle PBCS", "Oracle Fusion Cloud EPM", "Oracle FCCS"],
  "SAP": ["SAP", "SAP Analytics Cloud", "SAP BPC"],
  "Pigment": ["Pigment"],
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    let body: Record<string, any> = {};
    try { body = await req.json(); } catch { /* no body is fine */ }
    const competitorFilter: string[] = body.competitors || PRIORITY_COMPETITORS;

    const results: Array<{
      competitor: string;
      before_count: number;
      after_count: number;
      new_media: number;
      persist_status: string;
      skipped: boolean;
      error?: string;
    }> = [];

    console.log(`[scheduled-media-refresh] Starting refresh for ${competitorFilter.length} competitors`);

    for (const competitor of competitorFilter) {
      console.log(`\n[scheduled-media-refresh] ═══ Processing: ${competitor} ═══`);
      const startTime = Date.now();
      const variants = NAME_VARIANTS[competitor] || [competitor];

      try {
        // Step 1: Count existing gallery media BEFORE crawl
        const { count: beforeCount } = await supabase
          .from("media_assets")
          .select("id", { count: "exact", head: true })
          .in("competitor_name", variants)
          .eq("is_active", true);

        const before = beforeCount || 0;
        console.log(`[scheduled-media-refresh] ${competitor}: ${before} existing gallery assets`);

        // Step 2: Run bulk-media-crawl
        console.log(`[scheduled-media-refresh] Running bulk-media-crawl for ${competitor}...`);
        const crawlRes = await fetch(`${SUPABASE_URL}/functions/v1/bulk-media-crawl`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({ competitor }),
        });

        if (!crawlRes.ok) {
          console.error(`[scheduled-media-refresh] Crawl failed for ${competitor}: ${crawlRes.status}`);
          results.push({ competitor, before_count: before, after_count: before, new_media: 0, persist_status: "skipped", skipped: true, error: `crawl ${crawlRes.status}` });
          continue;
        }

        await crawlRes.json(); // consume body

        // Step 3: Count gallery media AFTER crawl
        const { count: afterCount } = await supabase
          .from("media_assets")
          .select("id", { count: "exact", head: true })
          .in("competitor_name", variants)
          .eq("is_active", true);

        const after = afterCount || 0;
        const newMedia = after - before;

        if (newMedia <= 0) {
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
          console.log(`[scheduled-media-refresh] ⏭ ${competitor}: no new media found (${before} → ${after}), skipping persist. (${elapsed}s)`);
          results.push({ competitor, before_count: before, after_count: after, new_media: 0, persist_status: "skipped", skipped: true });
          continue;
        }

        console.log(`[scheduled-media-refresh] ✓ ${competitor}: ${newMedia} new media found (${before} → ${after})`);

        // Step 4: Persist new CDN URLs to permanent storage
        let totalPersisted = 0;
        let persistStatus = "ok";

        for (const variant of variants) {
          try {
            const persistRes = await fetch(`${SUPABASE_URL}/functions/v1/persist-media`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
              },
              body: JSON.stringify({ competitor_name: variant, skip_quality_gate: true }),
            });

            if (persistRes.ok) {
              const persistData = await persistRes.json();
              totalPersisted += persistData.persisted || 0;
            } else {
              persistStatus = "partial";
            }
          } catch {
            persistStatus = "partial";
          }
        }

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`[scheduled-media-refresh] ✓ ${competitor} done in ${elapsed}s — ${newMedia} new, ${totalPersisted} persisted`);

        results.push({ competitor, before_count: before, after_count: after, new_media: newMedia, persist_status: persistStatus, skipped: false });
      } catch (err) {
        console.error(`[scheduled-media-refresh] Error for ${competitor}:`, err);
        results.push({ competitor, before_count: 0, after_count: 0, new_media: 0, persist_status: "error", skipped: true, error: String(err) });
      }
    }

    // Step 5: Migrate any remaining CDN-only assets across ALL competitors
    console.log(`\n[scheduled-media-refresh] Migrating remaining CDN-only assets...`);
    try {
      const migrateRes = await fetch(`${SUPABASE_URL}/functions/v1/migrate-cdn-to-storage`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({}),
      });
      if (migrateRes.ok) {
        const migrateData = await migrateRes.json();
        console.log(`[scheduled-media-refresh] Migration: ${JSON.stringify(migrateData).slice(0, 300)}`);
      }
    } catch (err) {
      console.error(`[scheduled-media-refresh] Migration error:`, err);
    }

    const totalNew = results.reduce((s, r) => s + r.new_media, 0);
    const skippedCount = results.filter(r => r.skipped).length;
    console.log(`\n[scheduled-media-refresh] ═══ Complete: ${totalNew} new media, ${skippedCount}/${results.length} skipped ═══`);

    return new Response(
      JSON.stringify({ success: true, results, total_new: totalNew, skipped: skippedCount }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[scheduled-media-refresh] Fatal error:", err);
    return new Response(
      JSON.stringify({ success: false, error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
