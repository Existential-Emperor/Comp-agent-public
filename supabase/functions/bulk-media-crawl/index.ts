import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { PRODUCT_AREA_DEFINITIONS } from "../_shared/product-areas.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const TARGET_COMPETITORS = ["Pigment", "Planful", "OneStream", "Anaplan", "Oracle EPM", "SAP"];

// YouTube domains to exclude
const YT_DOMAINS = /youtube\.com|youtu\.be|ggpht\.com/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Optional: filter by specific competitor or product area
    let body: Record<string, string> = {};
    try {
      body = await req.json();
    } catch { /* no body is fine */ }
    const filterCompetitor = body.competitor || "";
    const filterArea = body.product_area || "";

    const competitors = filterCompetitor
      ? TARGET_COMPETITORS.filter(c => c.toLowerCase() === filterCompetitor.toLowerCase())
      : TARGET_COMPETITORS;

    // Build product area list (excluding "Full Product")
    const productAreas: Array<{ category: string; subCategory: string }> = [];
    for (const [cat, subs] of Object.entries(PRODUCT_AREA_DEFINITIONS)) {
      if (cat === "Full Product") continue;
      for (const sub of Object.keys(subs)) {
        if (filterArea && cat !== filterArea) continue;
        productAreas.push({ category: cat, subCategory: sub });
      }
    }

    console.log(`[bulk-media-crawl] Starting for ${competitors.length} competitors × ${productAreas.length} product areas`);

    const results: Array<{
      competitor: string;
      product_area: string;
      product_sub_area: string;
      pages_crawled: number;
      media_found: number;
    }> = [];

    for (const competitor of competitors) {
      // Get all pages for this competitor
      const { data: pages } = await supabase
        .from("competitor_pages")
        .select("id, page_url, competitor_name, raw_content, metadata")
        .ilike("competitor_name", `%${competitor}%`)
        .in("crawl_status", ["done", "completed"]);

      if (!pages || pages.length === 0) {
        console.log(`[bulk-media-crawl] No pages found for ${competitor}`);
        continue;
      }

      console.log(`[bulk-media-crawl] Found ${pages.length} pages for ${competitor}`);

      for (const area of productAreas) {
        // For each product area, invoke the screenshot-worker for each page
        // The screenshot-worker handles media extraction and storage
        let mediaCount = 0;
        let pagesCrawled = 0;

        for (const page of pages) {
          try {
            // Call screenshot-worker which handles scraping + media extraction + storage
            const workerRes = await fetch(`${SUPABASE_URL}/functions/v1/screenshot-worker`, {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                page_url: page.page_url,
                competitor_name: page.competitor_name,
                page_id: page.id,
                category: area.category,
                sub_category: area.subCategory,
              }),
            });

            if (!workerRes.ok) {
              console.error(`[bulk-media-crawl] Worker failed for ${page.page_url}: ${workerRes.status}`);
              continue;
            }

            const workerData = await workerRes.json();
            const approvedUrls: string[] = workerData.screenshot_urls || [];
            pagesCrawled++;

            // Filter through quality gate before storing
            const candidateUrls = approvedUrls.filter((u: string) => !YT_DOMAINS.test(u));
            
            if (candidateUrls.length > 0) {
              // Run media-quality-agent on all candidates
              const mediaItems = candidateUrls.map((u: string) => ({
                url: u,
                label: `${area.subCategory} - ${u.split("/").pop() || "image"}`,
                type: "image" as const,
              }));

              let qualityPassed: Set<string> = new Set(candidateUrls); // default: allow all if gate fails
              try {
                const qaRes = await fetch(`${SUPABASE_URL}/functions/v1/media-quality-agent`, {
                  method: "POST",
                  headers: {
                    "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                    competitor: page.competitor_name,
                    category: area.category,
                    subCategory: area.subCategory,
                    mediaItems,
                  }),
                });

                if (qaRes.ok) {
                  const qaData = await qaRes.json();
                  qualityPassed = new Set((qaData.filteredMedia || []).map((m: { url: string }) => m.url));
                  const rejectedCount = (qaData.rejectedMedia || []).length;
                  if (rejectedCount > 0) {
                    console.log(`[bulk-media-crawl] Quality gate rejected ${rejectedCount}/${candidateUrls.length} images for ${area.subCategory}`);
                  }

                  // Store quality scores in metadata for passed items
                  for (const rated of [...(qaData.filteredMedia || []), ...(qaData.rejectedMedia || [])]) {
                    const passed = qualityPassed.has(rated.url);
                    try {
                      await supabase.from("media_assets").upsert(
                        {
                          competitor_name: page.competitor_name,
                          product_area: area.category,
                          product_sub_area: area.subCategory,
                          page_url: page.page_url,
                          storage_url: rated.url,
                          cdn_url: rated.url,
                          media_type: /\.(gif)(\?|$)/i.test(rated.url) ? "gif" : "image",
                          source_type: rated.url.includes("/inline-") ? "inline" : "viewport",
                          captured_at: new Date().toISOString(),
                          last_refreshed_at: new Date().toISOString(),
                          is_active: passed,
                          metadata: {
                            crawl_source: "bulk-media-crawl",
                            worker_mode: workerData.source_mode,
                            quality_score: rated.score,
                            quality_reasoning: rated.reasoning,
                          },
                        },
                        { onConflict: "competitor_name,page_url,storage_url" }
                      );
                      if (passed) mediaCount++;
                    } catch (err) {
                      console.error(`[bulk-media-crawl] Upsert error:`, err);
                    }
                  }
                } else {
                  console.error(`[bulk-media-crawl] Quality gate failed: ${qaRes.status}, storing all`);
                  // Fallback: store all without scores
                  for (const storageUrl of candidateUrls) {
                    try {
                      await supabase.from("media_assets").upsert(
                        {
                          competitor_name: page.competitor_name,
                          product_area: area.category,
                          product_sub_area: area.subCategory,
                          page_url: page.page_url,
                          storage_url: storageUrl,
                          cdn_url: storageUrl,
                          media_type: /\.(gif)(\?|$)/i.test(storageUrl) ? "gif" : "image",
                          source_type: storageUrl.includes("/inline-") ? "inline" : "viewport",
                          captured_at: new Date().toISOString(),
                          last_refreshed_at: new Date().toISOString(),
                          is_active: true,
                          metadata: {
                            crawl_source: "bulk-media-crawl",
                            worker_mode: workerData.source_mode,
                            quality_gate_skipped: true,
                          },
                        },
                        { onConflict: "competitor_name,page_url,storage_url" }
                      );
                      mediaCount++;
                    } catch (err) {
                      console.error(`[bulk-media-crawl] Upsert error:`, err);
                    }
                  }
                }
              } catch (err) {
                console.error(`[bulk-media-crawl] Quality gate error:`, err);
              }
            }

            console.log(`[bulk-media-crawl] ${page.competitor_name} / ${area.subCategory} / ${page.page_url}: ${approvedUrls.length} media`);
          } catch (err) {
            console.error(`[bulk-media-crawl] Error processing ${page.page_url}:`, err);
          }
        }

        if (pagesCrawled > 0) {
          results.push({
            competitor,
            product_area: area.category,
            product_sub_area: area.subCategory,
            pages_crawled: pagesCrawled,
            media_found: mediaCount,
          });
        }
      }
    // After crawling all areas for this competitor, persist CDN URLs to permanent storage
    console.log(`[bulk-media-crawl] Running persist-media for ${competitor}...`);
    try {
      const persistRes = await fetch(`${SUPABASE_URL}/functions/v1/persist-media`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({ competitor_name: competitor, skip_quality_gate: true }),
      });
      if (persistRes.ok) {
        const persistData = await persistRes.json();
        console.log(`[bulk-media-crawl] Persisted ${persistData.persisted || 0} assets for ${competitor}`);
      } else {
        console.error(`[bulk-media-crawl] Persist failed for ${competitor}: ${persistRes.status}`);
      }
    } catch (err) {
      console.error(`[bulk-media-crawl] Persist error for ${competitor}:`, err);
    }
  }

    console.log(`[bulk-media-crawl] Complete. Total results: ${results.length}`);

    return new Response(
      JSON.stringify({ success: true, results, total_competitors: competitors.length, total_areas: productAreas.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[bulk-media-crawl] Error:", err);
    return new Response(
      JSON.stringify({ success: false, error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
