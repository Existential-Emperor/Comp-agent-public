import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { firecrawlFetch, hasFirecrawlKey } from "../_shared/firecrawl-keys.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Ambient Crawler - Scheduled agent that checks for content updates
 * across competitor pages and refreshes stale knowledge.
 *
 * Strategy:
 * 1. Find pages not crawled in the last 48 hours
 * 2. Re-scrape them and compare content hashes
 * 3. If content changed, re-summarize and update screenshots
 * 4. Prioritize docs/help pages over blogs (docs change = product updates)
 */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!hasFirecrawlKey()) {
      return new Response(JSON.stringify({ error: "Firecrawl not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Create run record
    const { data: runRecord } = await supabase
      .from("crawler_runs")
      .insert({ run_type: "scheduled", status: "running" })
      .select("id")
      .single();

    const runId = runRecord?.id;

    // Find stale pages (not crawled in 48h), prioritize docs/help over blogs
    const staleThreshold = new Date(Date.now() - 48 * 3600000).toISOString();

    const { data: stalePages } = await supabase
      .from("competitor_pages")
      .select("id, competitor_name, page_url, page_type, content_hash, screenshot_urls")
      .lt("last_crawled_at", staleThreshold)
      .eq("crawl_status", "completed")
      .order("page_type", { ascending: true }) // docs/help first alphabetically
      .limit(30); // Process max 30 pages per run to stay within time limits

    if (!stalePages || stalePages.length === 0) {
      console.log("No stale pages found. Everything is fresh.");
      if (runId) {
        await supabase
          .from("crawler_runs")
          .update({
            status: "completed",
            pages_crawled: 0,
            pages_updated: 0,
            completed_at: new Date().toISOString(),
          })
          .eq("id", runId);
      }
      return new Response(
        JSON.stringify({ success: true, message: "No stale pages", pages_checked: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Found ${stalePages.length} stale pages to refresh`);

    let pagesUpdated = 0;
    let screenshotsTaken = 0;
    const errors: string[] = [];

    // Process in batches of 3
    for (let i = 0; i < stalePages.length; i += 2) {
      const batch = stalePages.slice(i, i + 2);
      const batchResults = await Promise.allSettled(
        batch.map(async (page) => {
          try {
            // Re-scrape the page
            const shouldScreenshot = page.page_type === "docs" || page.page_type === "help";

            const res = await firecrawlFetch("https://api.firecrawl.dev/v1/scrape", {
              method: "POST",
              body: JSON.stringify({
                url: page.page_url,
                formats: ["markdown"],
                onlyMainContent: true,
                waitFor: 2000,
              }),
            });

            if (!res.ok) {
              console.error(`Re-scrape failed for ${page.page_url}: ${res.status}`);
              // Mark as crawled even if failed, to avoid retrying too fast
              await supabase
                .from("competitor_pages")
                .update({ last_crawled_at: new Date().toISOString() })
                .eq("id", page.id);
              return;
            }

            const data = await res.json();
            const pageData = data.data || data;
            const markdown = pageData.markdown || "";

            if (markdown.length < 50) {
              await supabase
                .from("competitor_pages")
                .update({ last_crawled_at: new Date().toISOString() })
                .eq("id", page.id);
              return;
            }

            // Check content hash
            let hash = 0;
            for (let j = 0; j < markdown.length; j++) {
              hash = ((hash << 5) - hash) + markdown.charCodeAt(j);
              hash |= 0;
            }
            const newHash = hash.toString(36);
            const contentChanged = newHash !== page.content_hash;

            const updateData: Record<string, unknown> = {
              last_crawled_at: new Date().toISOString(),
              content_hash: newHash,
              word_count: markdown.split(/\s+/).length,
              raw_content: markdown.slice(0, 50000),
              crawl_status: "completed",
            };

            // If content changed, re-summarize
            if (contentChanged && LOVABLE_API_KEY) {
              console.log(`Content changed for ${page.page_url} — re-summarizing`);
              try {
                const summRes = await fetch(
                  "https://ai-gateway.lovable.dev/api/chat/completions",
                  {
                    method: "POST",
                    headers: {
                      Authorization: `Bearer ${LOVABLE_API_KEY}`,
                      "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                      model: "google/gemini-2.5-flash-lite",
                      messages: [
                        {
                          role: "system",
                          content: `You are a competitive intelligence analyst for Workday Adaptive Planning. Extract key product capabilities, features, differentiators, and technical details from this ${page.page_type} page for ${page.competitor_name}. Structured summary under 1500 words.`,
                        },
                        { role: "user", content: markdown.slice(0, 30000) },
                      ],
                      max_tokens: 2000,
                      temperature: 0.1,
                    }),
                  }
                );
                if (summRes.ok) {
                  const summData = await summRes.json();
                  const summary = summData.choices?.[0]?.message?.content;
                  if (summary) updateData.content_summary = summary;
                }
              } catch { /* skip summarization failure */ }

              updateData.content_updated_at = new Date().toISOString();
              pagesUpdated++;
            }

            // Delegate screenshot capture to screenshot-worker for proper inline image extraction
            if (shouldScreenshot && contentChanged) {
              try {
                console.log(`Delegating screenshot capture to screenshot-worker for ${page.page_url}`);
                const workerRes = await fetch(
                  `${SUPABASE_URL}/functions/v1/screenshot-worker`,
                  {
                    method: "POST",
                    headers: {
                      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
                      "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                      page_url: page.page_url,
                      competitor_name: page.competitor_name,
                      page_id: page.id,
                    }),
                  }
                );

                if (workerRes.ok) {
                  const workerData = await workerRes.json();
                  if (workerData.total_approved > 0) {
                    screenshotsTaken += workerData.total_approved;
                    console.log(`Screenshot-worker captured ${workerData.total_approved} images (mode: ${workerData.source_mode}) for ${page.page_url}`);
                  }
                  // screenshot-worker already saves to competitor_pages via saveScreenshotsToPage,
                  // so we don't need to set screenshot_urls in updateData
                } else {
                  const errText = await workerRes.text();
                  console.error(`Screenshot-worker failed for ${page.page_url}: ${workerRes.status} ${errText.slice(0, 200)}`);
                }
              } catch (ssErr) {
                console.error(`Screenshot-worker delegation error for ${page.page_url}:`, ssErr);
              }
            }

            await supabase.from("competitor_pages").update(updateData).eq("id", page.id);
          } catch (err) {
            errors.push(`${page.page_url}: ${String(err).slice(0, 150)}`);
          }
        })
      );

      for (const r of batchResults) {
        if (r.status === "rejected") errors.push(String(r.reason).slice(0, 200));
      }
    }

    // Update run record
    if (runId) {
      await supabase
        .from("crawler_runs")
        .update({
          status: "completed",
          pages_crawled: stalePages.length,
          pages_updated: pagesUpdated,
          screenshots_taken: screenshotsTaken,
          errors: errors.slice(0, 20),
          completed_at: new Date().toISOString(),
        })
        .eq("id", runId);
    }

    const summary = {
      success: true,
      run_id: runId,
      pages_checked: stalePages.length,
      pages_updated: pagesUpdated,
      screenshots_taken: screenshotsTaken,
      errors_count: errors.length,
    };

    console.log("Ambient crawl complete:", JSON.stringify(summary));

    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Ambient crawler error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
