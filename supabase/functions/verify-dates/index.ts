import { requireAuth } from "../_shared/auth.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { firecrawlFetch, hasFirecrawlKey } from "../_shared/firecrawl-keys.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// Parse relative dates like "2y ago", "4 mo ago", "3d ago", "1 week ago"
function parseRelativeDate(text: string): Date | null {
  const now = new Date();
  const lower = text.toLowerCase().trim();

  // Match patterns like "2y", "4mo", "3d", "1w", "5h", "2 years ago", "4 months ago"
  const patterns = [
    { regex: /(\d+)\s*y(?:ears?|r)?\s*(?:ago)?/i, unit: "year" },
    { regex: /(\d+)\s*mo(?:nths?)?\s*(?:ago)?/i, unit: "month" },
    { regex: /(\d+)\s*w(?:eeks?|k)?\s*(?:ago)?/i, unit: "week" },
    { regex: /(\d+)\s*d(?:ays?)?\s*(?:ago)?/i, unit: "day" },
    { regex: /(\d+)\s*h(?:ours?|r)?\s*(?:ago)?/i, unit: "hour" },
  ];

  for (const { regex, unit } of patterns) {
    const match = lower.match(regex);
    if (match) {
      const val = parseInt(match[1]);
      const d = new Date(now);
      if (unit === "year") d.setFullYear(d.getFullYear() - val);
      else if (unit === "month") d.setMonth(d.getMonth() - val);
      else if (unit === "week") d.setDate(d.getDate() - val * 7);
      else if (unit === "day") d.setDate(d.getDate() - val);
      else if (unit === "hour") d.setHours(d.getHours() - val);
      return d;
    }
  }
  return null;
}

// Extract date from scraped page metadata or content
function extractDateFromScrape(data: any): Date | null {
  const metadata = data?.data?.metadata || data?.metadata || {};

  // Check metadata date fields
  const dateFields = [
    metadata.publishedTime, metadata.published_time, metadata.datePublished,
    metadata.date_published, metadata.article_published_time,
    metadata["article:published_time"], metadata.og_published_time,
    metadata.modifiedTime, metadata.modified_time,
    metadata.ogDate, metadata.date,
  ];

  for (const field of dateFields) {
    if (field) {
      const d = new Date(field);
      if (!isNaN(d.getTime()) && d.getTime() < Date.now() + 86400000) return d;
    }
  }

  // Try to extract date from HTML meta tags
  const html = data?.data?.html || data?.html || "";
  const metaDatePatterns = [
    /content="(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}[^"]*)"[^>]*property="article:published_time"/i,
    /property="article:published_time"[^>]*content="([^"]+)"/i,
    /name="date"[^>]*content="([^"]+)"/i,
    /name="pubdate"[^>]*content="([^"]+)"/i,
    /itemprop="datePublished"[^>]*content="([^"]+)"/i,
    /"datePublished"\s*:\s*"([^"]+)"/i,
    /"publishedDate"\s*:\s*"([^"]+)"/i,
  ];

  for (const pat of metaDatePatterns) {
    const m = html.match(pat);
    if (m) {
      const d = new Date(m[1]);
      if (!isNaN(d.getTime()) && d.getTime() < Date.now() + 86400000) return d;
    }
  }

  // Check for relative dates in the markdown content (Reddit, LinkedIn)
  const markdown = data?.data?.markdown || data?.markdown || "";
  const allText = `${markdown}`;
  
  // Look for relative dates anywhere
  const relPatterns = [
    /(\d+)\s*(?:years?|yr?)\s*ago/i,
    /(\d+)\s*(?:months?|mo)\s*ago/i,
    /(\d+)\s*(?:weeks?|wk?)\s*ago/i,
    /(\d+)\s*(?:days?|d)\s*ago/i,
  ];

  for (const pat of relPatterns) {
    const m = allText.match(pat);
    if (m) {
      const parsed = parseRelativeDate(m[0]);
      if (parsed) return parsed;
    }
  }

  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // --- Auth guard (shared): valid user JWT or service-role key required ---
  const authError = await requireAuth(req, corsHeaders);
  if (authError) return authError;

  try {
    const { batchSize = 20, itemType } = await req.json().catch(() => ({}));

    if (!hasFirecrawlKey()) {
      return new Response(JSON.stringify({ error: "No Firecrawl key" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get items that likely have incorrect dates:
    // 1. published_at is null
    // 2. published_at matches fetched_at closely (was set to now() at ingest)
    // 3. published_at is 2026-01-01 (generic fallback)
    let query = supabase.from("news_items").select("id, title, source_url, published_at, fetched_at, item_type")
      .order("created_at", { ascending: false })
      .limit(batchSize);

    if (itemType) {
      query = query.eq("item_type", itemType);
    }

    const { data: items, error: fetchError } = await query;
    if (fetchError) throw fetchError;

    // Filter to items with suspicious dates
    const suspicious = (items || []).filter((item: any) => {
      if (!item.published_at) return true;
      // Generic fallback date
      if (item.published_at.startsWith("2026-01-01")) return true;
      // published_at very close to fetched_at (within 5 min) = was set to now()
      const pub = new Date(item.published_at).getTime();
      const fetched = new Date(item.fetched_at).getTime();
      if (Math.abs(pub - fetched) < 5 * 60 * 1000) return true;
      return false;
    });

    console.log(`Found ${suspicious.length} items with suspicious dates out of ${items?.length}`);

    let updated = 0;
    let failed = 0;
    const results: any[] = [];

    for (const item of suspicious) {
      try {
        // For Reddit posts, use the JSON API which returns created_utc
        if (item.source_url.includes("reddit.com/r/")) {
          try {
            // Use Firecrawl search to find the Reddit post - search results often include dates
            const match = item.source_url.match(/\/comments\/([a-z0-9]+)/i);
            const postId = match?.[1] || "";
            const searchQuery = `site:reddit.com ${item.title.replace(/ : r\/\w+.*$/, "").slice(0, 80)}`;
            console.log(`Searching for Reddit post date: ${searchQuery}`);
            
            const searchRes = await firecrawlFetch("https://api.firecrawl.dev/v1/search", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ query: searchQuery, limit: 3 }),
            });
            
            if (searchRes.ok) {
              const searchData = await searchRes.json();
              const searchResults = searchData?.data || [];
              // Look for a result matching our post URL
              for (const sr of searchResults) {
                if (sr.url?.includes(postId) && sr.publishedDate) {
                  const d = new Date(sr.publishedDate);
                  if (!isNaN(d.getTime()) && d.getTime() < Date.now() + 86400000) {
                    await supabase.from("news_items").update({ published_at: d.toISOString() }).eq("id", item.id);
                    updated++;
                    results.push({ id: item.id, title: item.title, oldDate: item.published_at, newDate: d.toISOString(), status: "updated_reddit_search" });
                    await new Promise((r) => setTimeout(r, 1200));
                    continue;
                  }
                }
              }
            }
            await new Promise((r) => setTimeout(r, 1200));
          } catch (e) {
            console.warn(`Reddit search failed for ${item.source_url}: ${e}`);
          }
        }

        // Scrape the URL for metadata
        const scrapeRes = await firecrawlFetch("https://api.firecrawl.dev/v1/scrape", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: item.source_url,
            formats: ["markdown", "html"],
            onlyMainContent: false,
            waitFor: 2000,
          }),
        });

        if (!scrapeRes.ok) {
          console.warn(`Firecrawl failed for ${item.source_url}: ${scrapeRes.status}`);
          failed++;
          results.push({ id: item.id, title: item.title, status: "scrape_failed" });
          continue;
        }

        const scrapeData = await scrapeRes.json();
        const extractedDate = extractDateFromScrape(scrapeData);

        if (extractedDate) {
          const { error: updateError } = await supabase
            .from("news_items")
            .update({ published_at: extractedDate.toISOString() })
            .eq("id", item.id);

          if (!updateError) {
            updated++;
            results.push({
              id: item.id, title: item.title,
              oldDate: item.published_at,
              newDate: extractedDate.toISOString(),
              status: "updated",
            });
          } else {
            failed++;
            results.push({ id: item.id, title: item.title, status: "update_failed" });
          }
        } else {
          // For community items, try to extract relative date from the markdown
          const markdown = scrapeData?.data?.markdown || scrapeData?.markdown || "";
          const relPatterns = [
            /(\d+)\s*(?:years?|yr?)\s*ago/i,
            /(\d+)\s*(?:months?|mo)\s*ago/i,
            /(\d+)\s*(?:weeks?|wk?)\s*ago/i,
            /(\d+)\s*(?:days?|d)\s*ago/i,
          ];

          let foundRelDate: Date | null = null;
          for (const pat of relPatterns) {
            const m = markdown.match(pat);
            if (m) {
              foundRelDate = parseRelativeDate(m[0]);
              if (foundRelDate) break;
            }
          }

          if (foundRelDate) {
            await supabase
              .from("news_items")
              .update({ published_at: foundRelDate.toISOString() })
              .eq("id", item.id);
            updated++;
            results.push({
              id: item.id, title: item.title,
              oldDate: item.published_at,
              newDate: foundRelDate.toISOString(),
              status: "updated_from_relative",
            });
          } else {
            // Set published_at to null so filter treats it correctly
            await supabase
              .from("news_items")
              .update({ published_at: null })
              .eq("id", item.id);
            results.push({ id: item.id, title: item.title, status: "no_date_found_nulled" });
          }
        }

        // Rate limit: ~1 req/sec for Firecrawl
        await new Promise((r) => setTimeout(r, 1200));
      } catch (err) {
        console.error(`Error processing ${item.id}:`, err);
        failed++;
        results.push({ id: item.id, title: item.title, status: "error", error: String(err) });
      }
    }

    return new Response(JSON.stringify({
      total: suspicious.length,
      updated,
      failed,
      results,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("verify-dates error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
