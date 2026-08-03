import { requireAuth } from "../_shared/auth.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { firecrawlFetch, hasFirecrawlKey } from "../_shared/firecrawl-keys.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const YT_DOMAINS = /youtube\.com|youtu\.be|ggpht\.com|vimeo\.com|wistia\.(com|net)/i;

function extractInlineImageUrls(content: string, baseUrl?: string): string[] {
  const found: string[] = [];
  const seen = new Set<string>();

  const add = (rawUrl: string) => {
    const cleaned = rawUrl.replace(/[),.;]+$/, "").trim();
    if (!cleaned) return;

    let resolved = cleaned;
    if (!/^https?:\/\//i.test(cleaned)) {
      if (!baseUrl) return;
      try { resolved = new URL(cleaned, baseUrl).toString(); } catch { return; }
    }

    const lower = resolved.toLowerCase();
    if (/\b(icon|favicon|logo|avatar|badge|sprite|pixel|tracking|spacer|arrow|chevron|caret)\b/i.test(lower)) return;
    if (/\.(svg)(\?|$)/i.test(lower)) return;
    if (!/\.(png|jpg|jpeg|gif|webp)(\?|$)/i.test(lower) && !/cdn\.document360\.io|cloudfront|amazonaws|blob\.core|images?\//i.test(lower)) return;
    if (YT_DOMAINS.test(lower)) return;

    const dedupe = resolved.replace(/\?.*$/, "");
    if (seen.has(dedupe)) return;
    seen.add(dedupe);
    found.push(resolved);
  };

  let m: RegExpExecArray | null;
  const mdImageRegex = /!\[[^\]]*\]\(((?:[^()\s]|\([^)]*\))+)\)/gi;
  while ((m = mdImageRegex.exec(content)) !== null) add(m[1]);
  const imgTagRegex = /<img[^>]*(?:src|data-src)=["']([^"']+)["'][^>]*>/gi;
  while ((m = imgTagRegex.exec(content)) !== null) add(m[1]);
  const bareImageUrlRegex = /(https?:\/\/[^\s"'<>]+\.(?:png|jpe?g|gif|webp)(?:\?[^\s"'<>]*)?)/gi;
  while ((m = bareImageUrlRegex.exec(content)) !== null) add(m[1]);

  return found;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // --- Auth guard (shared): valid user JWT or service-role key required ---
  const authError = await requireAuth(req, corsHeaders);
  if (authError) return authError;

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    if (!hasFirecrawlKey()) {
      return new Response(
        JSON.stringify({ success: false, error: "Firecrawl not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get all active media assets
    const { data: assets } = await supabase
      .from("media_assets")
      .select("id, page_url, competitor_name, cdn_url, storage_url")
      .eq("is_active", true)
      .order("page_url");

    if (!assets || assets.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No active media assets to refresh", refreshed: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // SKIP assets already persisted to our own storage bucket — they don't need CDN refresh
    const PERMANENT_STORAGE_PATTERN = /supabase\.co\/storage/i;
    const needsRefresh = assets.filter(a => {
      const url = a.cdn_url || a.storage_url || "";
      return !PERMANENT_STORAGE_PATTERN.test(url);
    });

    const alreadyPersisted = assets.length - needsRefresh.length;
    console.log(`[refresh-media-cdns] ${assets.length} total assets, ${alreadyPersisted} already in permanent storage (skipped), ${needsRefresh.length} need refresh`);

    if (needsRefresh.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "All assets already in permanent storage", refreshed: 0, skipped: alreadyPersisted }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Group by page_url
    const pageGroups = new Map<string, typeof needsRefresh>();
    for (const asset of needsRefresh) {
      const group = pageGroups.get(asset.page_url) || [];
      group.push(asset);
      pageGroups.set(asset.page_url, group);
    }

    console.log(`[refresh-media-cdns] Refreshing ${needsRefresh.length} assets across ${pageGroups.size} pages`);

    let refreshed = 0;
    let errors = 0;

    for (const [pageUrl, pageAssets] of pageGroups) {
      try {
        const scrapeRes = await firecrawlFetch("https://api.firecrawl.dev/v1/scrape", {
          method: "POST",
          body: JSON.stringify({
            url: pageUrl,
            formats: ["markdown", "html"],
            onlyMainContent: true,
            waitFor: 2000,
            timeout: 60000,
          }),
        });

        if (!scrapeRes.ok) {
          console.error(`[refresh-media-cdns] Scrape failed for ${pageUrl}: ${scrapeRes.status}`);
          errors++;
          continue;
        }

        const scrapeData = await scrapeRes.json();
        const pageData = scrapeData.data || scrapeData;
        const combined = `${pageData.markdown || ""}\n${pageData.html || ""}`;
        const freshUrls = extractInlineImageUrls(combined, pageUrl);

        for (const asset of pageAssets) {
          const oldCdnPath = (asset.cdn_url || "").replace(/\?.*$/, "").split("/").pop() || "";

          let freshMatch = freshUrls.find(u => {
            const freshPath = u.replace(/\?.*$/, "").split("/").pop() || "";
            return freshPath === oldCdnPath;
          });

          if (!freshMatch) {
            const oldBasePath = (asset.cdn_url || "").replace(/\?.*$/, "");
            freshMatch = freshUrls.find(u => u.replace(/\?.*$/, "") === oldBasePath);
          }

          if (freshMatch) {
            await supabase
              .from("media_assets")
              .update({ cdn_url: freshMatch, last_refreshed_at: new Date().toISOString() })
              .eq("id", asset.id);
            refreshed++;
          } else {
            await supabase
              .from("media_assets")
              .update({ last_refreshed_at: new Date().toISOString() })
              .eq("id", asset.id);
          }
        }
      } catch (err) {
        console.error(`[refresh-media-cdns] Error for ${pageUrl}:`, err);
        errors++;
      }
    }

    console.log(`[refresh-media-cdns] Done. Refreshed: ${refreshed}, Errors: ${errors}, Skipped (permanent): ${alreadyPersisted}`);

    return new Response(
      JSON.stringify({ success: true, refreshed, errors, skipped_permanent: alreadyPersisted, total_pages: pageGroups.size, total_assets: assets.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[refresh-media-cdns] Error:", err);
    return new Response(
      JSON.stringify({ success: false, error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
