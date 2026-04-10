import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Re-score existing media assets through the quality gate.
 * Deactivates assets that fail (score < 7).
 * 
 * Input: { competitor: string }
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { competitor, restore_first } = await req.json();
    if (!competitor) {
      return new Response(JSON.stringify({ error: "competitor is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Optionally restore previously deactivated assets before rescoring
    if (restore_first) {
      const { data: restored } = await supabase
        .from("media_assets")
        .update({ is_active: true })
        .eq("competitor_name", competitor)
        .eq("is_active", false)
        .select("id");
      console.log(`[rescore-media] Restored ${restored?.length || 0} assets for ${competitor}`);
    }

    // Get all active assets for this competitor
    const { data: assets, error } = await supabase
      .from("media_assets")
      .select("id, competitor_name, product_area, product_sub_area, page_url, cdn_url, storage_url, media_type, metadata")
      .eq("competitor_name", competitor)
      .eq("is_active", true)
      .order("product_area")
      .limit(500);

    if (error) throw error;
    if (!assets || assets.length === 0) {
      return new Response(JSON.stringify({ message: "No active assets found", competitor }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[rescore-media] Found ${assets.length} active assets for ${competitor}`);

    // Group by product_area + product_sub_area for batch scoring
    const groups: Record<string, typeof assets> = {};
    for (const a of assets) {
      const key = `${a.product_area}|||${a.product_sub_area}`;
      (groups[key] = groups[key] || []).push(a);
    }

    let totalDeactivated = 0;
    let totalKept = 0;
    const details: Array<{ sub_area: string; kept: number; deactivated: number }> = [];

    for (const [key, groupAssets] of Object.entries(groups)) {
      const [category, subCategory] = key.split("|||");

      // Prefer storage_url (permanent) over cdn_url (may have expired SAS tokens)
      const mediaItems = groupAssets.map(a => {
        const isPermanentStorage = a.storage_url?.includes("supabase.co/storage/");
        const scoreUrl = isPermanentStorage ? a.storage_url : (a.cdn_url || a.storage_url);
        return {
          url: scoreUrl,
          label: `${a.product_sub_area} - ${scoreUrl.split("/").pop() || "image"}`,
          type: (a.media_type === "gif" ? "gif" : "image") as "image" | "gif",
        };
      });

      console.log(`[rescore-media] Scoring ${mediaItems.length} items for ${competitor} / ${subCategory}`);

      try {
        const qaRes = await fetch(`${SUPABASE_URL}/functions/v1/media-quality-agent`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            competitor,
            category,
            subCategory,
            mediaItems,
          }),
        });

        if (!qaRes.ok) {
          console.error(`[rescore-media] Quality gate failed for ${subCategory}: ${qaRes.status}`);
          continue;
        }

        const qaData = await qaRes.json();
        const passedUrls = new Set((qaData.filteredMedia || []).map((m: { url: string }) => m.url));
        const rejectedItems = qaData.rejectedMedia || [];

        // Deactivate rejected assets — match using the same URL we sent for scoring
        let deactivated = 0;
        for (const asset of groupAssets) {
          const isPermanentStorage = asset.storage_url?.includes("supabase.co/storage/");
          const scoreUrl = isPermanentStorage ? asset.storage_url : (asset.cdn_url || asset.storage_url);
          if (!passedUrls.has(scoreUrl)) {
            // Find the score/reasoning
            const rejected = rejectedItems.find((r: { url: string }) => r.url === scoreUrl);
            await supabase
              .from("media_assets")
              .update({
                is_active: false,
                metadata: {
                  ...(typeof asset.metadata === "object" && asset.metadata ? asset.metadata : {}),
                  rescore_result: "rejected",
                  rescore_score: rejected?.score,
                  rescore_reasoning: rejected?.reasoning,
                  rescored_at: new Date().toISOString(),
                } as any,
              })
              .eq("id", asset.id);
            deactivated++;
          } else {
            // Update metadata with new score
            const passed = (qaData.filteredMedia || []).find((r: { url: string }) => r.url === scoreUrl);
            if (passed) {
              await supabase
                .from("media_assets")
                .update({
                  metadata: {
                    ...(typeof asset.metadata === "object" && asset.metadata ? asset.metadata : {}),
                    rescore_result: "passed",
                    rescore_score: passed.score,
                    rescore_reasoning: passed.reasoning,
                    rescored_at: new Date().toISOString(),
                  } as any,
                })
                .eq("id", asset.id);
            }
          }
        }

        const kept = groupAssets.length - deactivated;
        totalDeactivated += deactivated;
        totalKept += kept;
        details.push({ sub_area: subCategory, kept, deactivated });

        if (deactivated > 0) {
          console.log(`[rescore-media] ${subCategory}: kept ${kept}, deactivated ${deactivated}`);
        }
      } catch (err) {
        console.error(`[rescore-media] Error scoring ${subCategory}:`, err);
      }
    }

    console.log(`[rescore-media] Done for ${competitor}: kept ${totalKept}, deactivated ${totalDeactivated}`);

    return new Response(
      JSON.stringify({
        success: true,
        competitor,
        total_assets: assets.length,
        kept: totalKept,
        deactivated: totalDeactivated,
        details,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[rescore-media] Error:", err);
    return new Response(
      JSON.stringify({ success: false, error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
