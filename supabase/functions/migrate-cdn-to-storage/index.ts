import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { firecrawlFetch, hasFirecrawlKey } from "../_shared/firecrawl-keys.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Migrate existing media_assets that have CDN URLs (non-Supabase storage) to permanent storage.
 * For expired CDN URLs, re-fetches from the source page using Firecrawl to get fresh URLs, 
 * then downloads and persists to Supabase storage.
 */

function slugify(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

function extFromContentType(ct: string | null): string {
  if (!ct) return "png";
  if (ct.includes("jpeg") || ct.includes("jpg")) return "jpg";
  if (ct.includes("webp")) return "webp";
  if (ct.includes("gif")) return "gif";
  return "png";
}

/** Extract inline image URLs from markdown+html content */
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
    if (/\b(icon|favicon|logo|avatar|badge|sprite|pixel|tracking|spacer|arrow)\b/i.test(lower)) return;
    if (/\.(svg)(\?|$)/i.test(lower)) return;
    if (/youtube\.com|youtu\.be|ggpht\.com/i.test(lower)) return;
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
  const bareUrl = /(https?:\/\/[^\s"'<>]+\.(?:png|jpe?g|gif|webp)(?:\?[^\s"'<>]*)?)/gi;
  while ((m = bareUrl.exec(content)) !== null) add(m[1]);

  return found;
}

async function tryDownload(url: string): Promise<Response | null> {
  const strategies = [
    { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36", "Accept": "image/*,*/*;q=0.8" } },
    { headers: { "User-Agent": "Mozilla/5.0", "Accept": "image/*,*/*", "Referer": new URL(url).origin + "/" } },
    { headers: {} },
  ];

  for (const opts of strategies) {
    try {
      const res = await fetch(url, { headers: opts.headers });
      if (res.ok) return res;
      await res.body?.cancel();
    } catch { /* next */ }
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    let body: Record<string, any> = {};
    try { body = await req.json(); } catch { /* no body */ }

    const PERMANENT_PATTERN = /supabase\.co\/storage/i;

    // Find all active assets where BOTH cdn_url AND storage_url are NOT permanent Supabase storage
    const { data: assets, error: fetchErr } = await supabase
      .from("media_assets")
      .select("id, storage_url, cdn_url, page_url, competitor_name, product_area, product_sub_area")
      .eq("is_active", true)
      .order("competitor_name")
      .limit(500);

    if (fetchErr) {
      return new Response(
        JSON.stringify({ success: false, error: fetchErr.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Filter to only assets needing migration (neither storage_url nor cdn_url is permanent)
    const needsMigration = (assets || []).filter(a => {
      const storageIsPermanent = PERMANENT_PATTERN.test(a.storage_url || "");
      const cdnIsPermanent = PERMANENT_PATTERN.test(a.cdn_url || "");
      return !storageIsPermanent && !cdnIsPermanent;
    });

    if (needsMigration.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "All assets already in permanent storage", migrated: 0, total: (assets || []).length }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[migrate-cdn-to-storage] ${needsMigration.length} assets need migration out of ${(assets || []).length} total`);

    let migrated = 0;
    let reFetched = 0;
    let failed = 0;
    const errors: string[] = [];

    // Group by page_url for efficient re-scraping of expired URLs
    const pageGroups = new Map<string, typeof needsMigration>();
    for (const asset of needsMigration) {
      const group = pageGroups.get(asset.page_url) || [];
      group.push(asset);
      pageGroups.set(asset.page_url, group);
    }

    const BATCH_SIZE = 3;
    const allAssets = [...needsMigration];

    for (let i = 0; i < allAssets.length; i += BATCH_SIZE) {
      const batch = allAssets.slice(i, i + BATCH_SIZE);

      const results = await Promise.allSettled(batch.map(async (asset) => {
        const url = asset.cdn_url || asset.storage_url;
        if (!url) throw new Error("No URL available");

        // Step 1: Try downloading the current URL directly
        let imgRes = await tryDownload(url);

        // Step 2: If download fails (expired SAS token), re-scrape the page to get fresh URL
        if (!imgRes && hasFirecrawlKey()) {
          console.log(`[migrate-cdn-to-storage] CDN expired for ${url.slice(0, 80)}, re-scraping ${asset.page_url}...`);
          try {
            const scrapeRes = await firecrawlFetch("https://api.firecrawl.dev/v1/scrape", {
              method: "POST",
              body: JSON.stringify({
                url: asset.page_url,
                formats: ["markdown", "html"],
                onlyMainContent: true,
                waitFor: 2000,
                timeout: 60000,
              }),
            });

            if (scrapeRes.ok) {
              const scrapeData = await scrapeRes.json();
              const pageData = scrapeData.data || scrapeData;
              const combined = `${pageData.markdown || ""}\n${pageData.html || ""}`;
              const freshUrls = extractInlineImageUrls(combined, asset.page_url);

              // Find matching fresh URL by filename
              const oldPath = url.replace(/\?.*$/, "").split("/").pop() || "";
              const freshMatch = freshUrls.find(u => {
                const freshPath = u.replace(/\?.*$/, "").split("/").pop() || "";
                return freshPath === oldPath;
              }) || freshUrls.find(u => u.replace(/\?.*$/, "") === url.replace(/\?.*$/, ""));

              if (freshMatch) {
                imgRes = await tryDownload(freshMatch);
                if (imgRes) {
                  reFetched++;
                  console.log(`[migrate-cdn-to-storage] ✓ Re-fetched fresh URL for ${oldPath}`);
                }
              }
            }
          } catch (err) {
            console.error(`[migrate-cdn-to-storage] Re-scrape error for ${asset.page_url}:`, err);
          }
        }

        if (!imgRes) {
          throw new Error(`Cannot download (expired?): ${url.slice(0, 80)}`);
        }

        // Step 3: Upload to permanent storage
        const rawContentType = imgRes.headers.get("content-type") || "image/png";
        const contentType = rawContentType.split(";")[0].trim();
        const imageBytes = new Uint8Array(await imgRes.arrayBuffer());

        if (imageBytes.length < 1000) {
          throw new Error(`Image too small (${imageBytes.length} bytes): ${url.slice(0, 80)}`);
        }

        // Byte diversity check
        const sampleSize = Math.min(imageBytes.length, 2000);
        const uniqueBytes = new Set(imageBytes.slice(0, sampleSize));
        if (uniqueBytes.size < 10) {
          throw new Error(`Image appears blank/corrupt: ${url.slice(0, 80)}`);
        }

        const normalizedType = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"].includes(contentType)
          ? contentType : "image/png";
        const ext = extFromContentType(normalizedType);
        const safeName = slugify(asset.competitor_name);
        const fileSlug = url.replace(/https?:\/\//, "").replace(/[^a-z0-9]/gi, "-").slice(0, 60);
        const filePath = `${safeName}/migrated-${fileSlug}-${Date.now()}.${ext}`;

        const { error: uploadErr } = await supabase.storage
          .from("competitor-screenshots")
          .upload(filePath, imageBytes, { contentType: normalizedType, upsert: true });

        if (uploadErr) throw new Error(`Upload failed: ${uploadErr.message}`);

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

        console.log(`[migrate-cdn-to-storage] ✓ Migrated ${asset.id}: ${publicUrl.slice(0, 80)}`);
        return asset.id;
      }));

      for (const r of results) {
        if (r.status === "fulfilled") {
          migrated++;
        } else {
          failed++;
          errors.push(r.reason?.message || "Unknown error");
          console.error(`[migrate-cdn-to-storage] ✗ ${r.reason?.message}`);
        }
      }
    }

    console.log(`[migrate-cdn-to-storage] Done: ${migrated} migrated (${reFetched} re-fetched), ${failed} failed`);

    return new Response(
      JSON.stringify({ success: true, migrated, reFetched, failed, errors: errors.slice(0, 10), total: (assets || []).length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[migrate-cdn-to-storage] Error:", err);
    return new Response(
      JSON.stringify({ success: false, error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
