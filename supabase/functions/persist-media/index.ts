import { requireAuth } from "../_shared/auth.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function slugify(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]/g, "-");
}

/**
 * Run media-quality-agent scoring on a batch of assets.
 * Returns a map of storage_url -> { score, reasoning }.
 */
async function qualityGateBatch(
  assets: Array<{ id: string; storage_url: string; competitor_name: string; product_area: string; product_sub_area: string }>,
  supabaseUrl: string,
  serviceKey: string,
): Promise<Map<string, { score: number; reasoning: string }>> {
  const results = new Map<string, { score: number; reasoning: string }>();

  // Group by competitor + product area for efficient batch scoring
  const groups = new Map<string, typeof assets>();
  for (const a of assets) {
    const key = `${a.competitor_name}|${a.product_area}|${a.product_sub_area}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(a);
  }

  for (const [groupKey, groupAssets] of groups) {
    const [competitor, category, subCategory] = groupKey.split("|");
    const mediaItems = groupAssets.map(a => ({
      url: a.storage_url,
      label: `${a.product_sub_area} - ${a.storage_url.split("/").pop() || "image"}`,
      type: "image" as const,
    }));

    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/media-quality-agent`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${serviceKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          competitor,
          category,
          subCategory,
          mediaItems,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const allRated = [...(data.filteredMedia || []), ...(data.rejectedMedia || [])];
        for (const rated of allRated) {
          results.set(rated.url, { score: rated.score, reasoning: rated.reasoning });
        }
      } else {
        console.error(`[persist-media] Quality gate call failed: ${res.status}`);
        // On failure, allow through with a warning score
        for (const a of groupAssets) {
          results.set(a.storage_url, { score: 5, reasoning: "Quality gate unavailable - defaulting to uncertain" });
        }
      }
    } catch (err) {
      console.error(`[persist-media] Quality gate error:`, err);
      for (const a of groupAssets) {
        results.set(a.storage_url, { score: 5, reasoning: "Quality gate error - defaulting to uncertain" });
      }
    }
  }

  return results;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // --- Auth guard (shared): valid user JWT or service-role key required ---
  const authError = await requireAuth(req, corsHeaders);
  if (authError) return authError;

  try {
    const body = await req.json();
    const { competitor_name, skip_quality_gate } = body;

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get assets where cdn_url is null OR cdn_url still points to external (non-supabase) URLs
    const { data: assets, error: fetchErr } = await supabase
      .from("media_assets")
      .select("id, storage_url, competitor_name, product_area, product_sub_area, metadata")
      .eq("competitor_name", competitor_name || "Oracle EPM Cloud")
      .or("cdn_url.is.null,storage_url.not.like.%supabase%")
      .eq("is_active", true);

    if (fetchErr) {
      return new Response(
        JSON.stringify({ success: false, error: fetchErr.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!assets || assets.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No assets need persisting", persisted: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[persist-media] Found ${assets.length} assets to persist for ${competitor_name || "Oracle EPM Cloud"}`);

    // ── Quality Gate ──────────────────────────────────────────────────
    // Run quality scoring on ALL assets that haven't been scored yet
    const ungatedAssets = assets.filter(a => {
      const meta = (a.metadata || {}) as Record<string, unknown>;
      return !meta.quality_score; // Not yet scored
    });

    let qualityScores = new Map<string, { score: number; reasoning: string }>();
    if (ungatedAssets.length > 0 && !skip_quality_gate) {
      console.log(`[persist-media] Running quality gate on ${ungatedAssets.length} unscored assets`);
      qualityScores = await qualityGateBatch(ungatedAssets, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

      // Deactivate assets that fail the quality gate (score < 7)
      let rejected = 0;
      for (const a of ungatedAssets) {
        const scoreData = qualityScores.get(a.storage_url);
        if (!scoreData) continue;

        const meta = (a.metadata || {}) as Record<string, unknown>;
        const updatedMeta = { ...meta, quality_score: scoreData.score, quality_reasoning: scoreData.reasoning };

        if (scoreData.score < 7) {
          // Deactivate - fails quality gate
          await supabase
            .from("media_assets")
            .update({ is_active: false, metadata: updatedMeta })
            .eq("id", a.id);
          rejected++;
          console.log(`[persist-media] ❌ Rejected (${scoreData.score}/10): ${a.storage_url.slice(0, 80)} — ${scoreData.reasoning}`);
        } else {
          // Update metadata with score but keep active
          await supabase
            .from("media_assets")
            .update({ metadata: updatedMeta })
            .eq("id", a.id);
          console.log(`[persist-media] ✅ Passed (${scoreData.score}/10): ${a.storage_url.slice(0, 80)}`);
        }
      }
      console.log(`[persist-media] Quality gate: ${rejected} rejected out of ${ungatedAssets.length}`);
    }

    // Re-fetch only active assets after quality gate
    const { data: activeAssets } = await supabase
      .from("media_assets")
      .select("id, storage_url, competitor_name, product_area, product_sub_area")
      .eq("competitor_name", competitor_name || "Oracle EPM Cloud")
      .or("cdn_url.is.null,storage_url.not.like.%supabase%")
      .eq("is_active", true);

    if (!activeAssets || activeAssets.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "All assets rejected by quality gate", persisted: 0, rejected: ungatedAssets.length }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Persist to Storage ────────────────────────────────────────────
    const safeName = slugify(activeAssets[0].competitor_name);
    let persisted = 0;
    let failed = 0;
    const errors: string[] = [];

    const BATCH_SIZE = 5;
    for (let b = 0; b < activeAssets.length; b += BATCH_SIZE) {
      const batch = activeAssets.slice(b, b + BATCH_SIZE);
      
      const results = await Promise.allSettled(
        batch.map(async (asset) => {
          const url = asset.storage_url;
          console.log(`[persist-media] Downloading: ${url.slice(0, 100)}`);

          let imgRes: Response | null = null;
          
          try {
            imgRes = await fetch(url, {
              headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
              },
            });
            if (!imgRes.ok) imgRes = null;
          } catch { imgRes = null; }

          if (!imgRes) {
            try {
              imgRes = await fetch(url, {
                headers: {
                  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                  "Accept": "image/*,*/*",
                  "Referer": "https://www.oracle.com/",
                  "Origin": "https://www.oracle.com",
                },
              });
              if (!imgRes.ok) imgRes = null;
            } catch { imgRes = null; }
          }

          if (!imgRes) {
            try {
              imgRes = await fetch(url);
              if (!imgRes.ok) imgRes = null;
            } catch { imgRes = null; }
          }

          if (!imgRes) {
            throw new Error(`Failed to download: ${url.slice(0, 80)}`);
          }

          const rawContentType = imgRes.headers.get("content-type") || "image/png";
          const contentType = rawContentType.split(";")[0].trim();
          const imageBytes = new Uint8Array(await imgRes.arrayBuffer());

          if (imageBytes.length < 1000) {
            throw new Error(`Image too small (${imageBytes.length} bytes): ${url.slice(0, 80)}`);
          }

          // Verify image isn't blank/corrupt by checking byte diversity
          // A blank white image will have very low entropy (mostly repeated 0xFF bytes)
          const sampleSize = Math.min(imageBytes.length, 2000);
          const uniqueBytes = new Set(imageBytes.slice(0, sampleSize));
          if (uniqueBytes.size < 10) {
            throw new Error(`Image appears blank/corrupt (only ${uniqueBytes.size} unique bytes): ${url.slice(0, 80)}`);
          }

          const normalizedType = contentType === "image/avif" ? "image/png" 
            : ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"].includes(contentType) 
            ? contentType : "image/png";

          const ext = normalizedType.includes("jpeg") || normalizedType.includes("jpg")
            ? "jpg"
            : contentType.includes("webp")
            ? "webp"
            : "png";

          const fileSlug = url.replace(/https?:\/\//, "").replace(/[^a-z0-9]/gi, "-").slice(0, 60);
          const filePath = `${safeName}/persisted-${fileSlug}-${Date.now()}.${ext}`;

          const { error: uploadErr } = await supabase.storage
            .from("competitor-screenshots")
            .upload(filePath, imageBytes, { contentType: normalizedType, upsert: true });

          if (uploadErr) {
            throw new Error(`Upload failed: ${uploadErr.message}`);
          }

          const { data: publicUrlData } = supabase.storage
            .from("competitor-screenshots")
            .getPublicUrl(filePath);

          const publicUrl = publicUrlData.publicUrl;

          await supabase
            .from("media_assets")
            .update({
              cdn_url: publicUrl,
              storage_url: publicUrl,
              last_refreshed_at: new Date().toISOString(),
            })
            .eq("id", asset.id);

          console.log(`[persist-media] ✓ Persisted ${asset.id}: ${publicUrl.slice(0, 80)}`);
          return asset.id;
        })
      );

      for (const r of results) {
        if (r.status === "fulfilled") {
          persisted++;
        } else {
          failed++;
          errors.push(r.reason?.message || "Unknown error");
          console.error(`[persist-media] ✗ ${r.reason?.message}`);
        }
      }
    }

    console.log(`[persist-media] Done: ${persisted} persisted, ${failed} failed`);

    return new Response(
      JSON.stringify({ success: true, persisted, failed, errors: errors.slice(0, 10) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[persist-media] Error:", err);
    return new Response(
      JSON.stringify({ success: false, error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
