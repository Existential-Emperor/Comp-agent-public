import { requireAuth } from "../_shared/auth.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { firecrawlFetch, hasFirecrawlKey } from "../_shared/firecrawl-keys.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Quick Media Extractor – lightweight inline-image-only pipeline.
 * Scrapes markdown+html, extracts image URLs, downloads & stores to bucket + media_assets.
 * No viewport screenshots, no vision gates. Fast enough for bulk use.
 */

const MAX_IMAGES = 10;
const YT_DOMAINS = /youtube\.com|youtu\.be|ggpht\.com|vimeo\.com|wistia\.(com|net)/i;

function slugify(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]/g, "-");
}

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
    if (YT_DOMAINS.test(lower)) return;
    if (!/\.(png|jpg|jpeg|gif|webp)(\?|$)/i.test(lower) && !/cdn\.document360\.io|cloudfront|amazonaws|blob\.core|images?\//i.test(lower)) return;
    const dedupe = resolved.replace(/\?.*$/, "");
    if (seen.has(dedupe)) return;
    seen.add(dedupe);
    found.push(resolved);
  };

  let m: RegExpExecArray | null;
  const mdImg = /!\[[^\]]*\]\(((?:[^()\s]|\([^)]*\))+)\)/gi;
  while ((m = mdImg.exec(content)) !== null) add(m[1]);
  const imgTag = /<img[^>]*(?:src|data-src)=["']([^"']+)["'][^>]*>/gi;
  while ((m = imgTag.exec(content)) !== null) add(m[1]);
  const bare = /(https?:\/\/[^\s"'<>]+\.(?:png|jpe?g|gif|webp)(?:\?[^\s"'<>]*)?)/gi;
  while ((m = bare.exec(content)) !== null) add(m[1]);

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
    const { pages } = await req.json();
    // pages: Array<{ page_url, competitor_name, page_id?, category, sub_category }>

    if (!pages || !Array.isArray(pages) || pages.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: "pages array required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!hasFirecrawlKey()) {
      return new Response(
        JSON.stringify({ success: false, error: "Firecrawl not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const results: Array<{ page_url: string; media_found: number; error?: string }> = [];

    for (const page of pages) {
      const { page_url, competitor_name, page_id, category, sub_category } = page;
      try {
        console.log(`[quick-media] Scraping ${page_url}`);

        const scrapeRes = await firecrawlFetch("https://api.firecrawl.dev/v1/scrape", {
          method: "POST",
          body: JSON.stringify({
            url: page_url,
            formats: ["markdown", "html"],
            onlyMainContent: true,
            waitFor: 2000,
            timeout: 30000,
          }),
        });

        if (!scrapeRes.ok) {
          const errText = await scrapeRes.text();
          console.error(`[quick-media] Scrape failed ${page_url}: ${scrapeRes.status}`);
          results.push({ page_url, media_found: 0, error: `scrape_failed_${scrapeRes.status}` });
          continue;
        }

        const scrapeData = await scrapeRes.json();
        const pageData = scrapeData.data || scrapeData;
        const combined = `${pageData.markdown || ""}\n${pageData.html || ""}`;
        const imageUrls = extractInlineImageUrls(combined, page_url).slice(0, MAX_IMAGES);

        console.log(`[quick-media] Found ${imageUrls.length} images on ${page_url}`);

        const safeName = slugify(competitor_name);
        const urlSlug = page_url.replace(/https?:\/\//, "").replace(/[^a-z0-9]/gi, "-").slice(0, 50);
        let savedCount = 0;

        for (let i = 0; i < imageUrls.length; i++) {
          const imageUrl = imageUrls[i];
          try {
            const imgRes = await fetch(imageUrl, {
              headers: {
                "User-Agent": "Mozilla/5.0 (compatible; LovableMediaBot/1.0)",
                "Accept": "image/*,*/*;q=0.8",
                "Referer": page_url,
              },
            });
            if (!imgRes.ok) continue;

            const contentType = imgRes.headers.get("content-type") || "image/png";
            if (!contentType.startsWith("image/")) continue;

            const imageBytes = new Uint8Array(await imgRes.arrayBuffer());
            if (imageBytes.length < 10000) continue; // skip tiny images

            const ext = contentType.includes("jpeg") ? "jpg" : contentType.includes("webp") ? "webp" : contentType.includes("gif") ? "gif" : "png";
            const filePath = `${safeName}/media-${i + 1}-${urlSlug}-${Date.now()}.${ext}`;

            const { error: uploadErr } = await supabase.storage
              .from("competitor-screenshots")
              .upload(filePath, imageBytes, { contentType, upsert: true });
            if (uploadErr) {
              console.error(`[quick-media] Upload failed:`, uploadErr);
              continue;
            }

            const { data: pubUrl } = supabase.storage.from("competitor-screenshots").getPublicUrl(filePath);
            const storageUrl = pubUrl?.publicUrl || "";
            if (!storageUrl) continue;

            // Upsert into media_assets
            await supabase.from("media_assets").upsert(
              {
                competitor_name,
                product_area: category || "Unknown",
                product_sub_area: sub_category || "Unknown",
                page_url,
                cdn_url: imageUrl,
                storage_url: storageUrl,
                media_type: ext === "gif" ? "gif" : "image",
                source_type: "inline",
                file_size_bytes: imageBytes.length,
                captured_at: new Date().toISOString(),
                last_refreshed_at: new Date().toISOString(),
                is_active: true,
                metadata: { crawl_source: "quick-media-extract" },
              },
              { onConflict: "competitor_name,page_url,storage_url" }
            );
            savedCount++;
          } catch (err) {
            console.error(`[quick-media] Image ${i} error:`, err);
          }
        }

        results.push({ page_url, media_found: savedCount });
        console.log(`[quick-media] Saved ${savedCount} images from ${page_url}`);
      } catch (err) {
        console.error(`[quick-media] Page error ${page_url}:`, err);
        results.push({ page_url, media_found: 0, error: String(err) });
      }
    }

    return new Response(
      JSON.stringify({ success: true, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[quick-media] Error:", err);
    return new Response(
      JSON.stringify({ success: false, error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
