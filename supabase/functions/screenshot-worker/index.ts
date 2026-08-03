import { requireAuth } from "../_shared/auth.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { firecrawlFetch, hasFirecrawlKey } from "../_shared/firecrawl-keys.ts";
import { monitoredFetch } from "../_shared/monitored-fetch.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Screenshot Worker – inline-image-first pipeline.
 *
 * 1) Scrape page markdown and extract embedded image URLs (preferred, highest value).
 * 2) Download + store those images in permanent storage (up to MAX_INLINE_IMAGES).
 * 3) If no inline images can be saved, fallback to scroll+viewport capture with vision gate.
 */

const SCROLL_INCREMENT = 600;
const MAX_SCROLL_STEPS = 8;
const MAX_INLINE_IMAGES = 8;

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
      try {
        resolved = new URL(cleaned, baseUrl).toString();
      } catch {
        return;
      }
    }

    const lower = resolved.toLowerCase();
    if (/\b(icon|favicon|logo|avatar|badge|sprite|pixel|tracking|spacer|arrow|chevron|caret)\b/i.test(lower)) return;
    if (/\.(svg)(\?|$)/i.test(lower)) return;
    if (!/\.(png|jpg|jpeg|gif|webp)(\?|$)/i.test(lower) && !/cdn\.document360\.io|cloudfront|amazonaws|blob\.core|images?\//i.test(lower)) return;

    const dedupe = resolved.replace(/\?.*$/, "");
    if (seen.has(dedupe)) return;

    seen.add(dedupe);
    found.push(resolved);
  };

  let m: RegExpExecArray | null;

  // Markdown images — handle URLs with balanced parentheses like image(26).png
  const mdImageRegex = /!\[[^\]]*\]\(((?:[^()\s]|\([^)]*\))+)\)/gi;
  while ((m = mdImageRegex.exec(content)) !== null) add(m[1]);

  const imgTagRegex = /<img[^>]*(?:src|data-src)=["']([^"']+)["'][^>]*>/gi;
  while ((m = imgTagRegex.exec(content)) !== null) add(m[1]);

  const srcsetRegex = /srcset=["']([^"']+)["']/gi;
  while ((m = srcsetRegex.exec(content)) !== null) {
    const parts = m[1].split(",").map(p => p.trim().split(/\s+/)[0]).filter(Boolean);
    for (const p of parts) add(p);
  }

  const bareImageUrlRegex = /(https?:\/\/[^\s"'<>]+\.(?:png|jpe?g|gif|webp)(?:\?[^\s"'<>]*)?)/gi;
  while ((m = bareImageUrlRegex.exec(content)) !== null) add(m[1]);

  return found;
}

// Extract video URLs from page markdown/HTML (YouTube, Vimeo, Oracle video embeds, etc.)
function extractVideoUrls(markdown: string): string[] {
  const found: string[] = [];
  const seen = new Set<string>();

  const add = (url: string) => {
    const clean = url.trim();
    if (seen.has(clean)) return;
    seen.add(clean);
    found.push(clean);
  };

  // YouTube watch URLs
  const ytWatch = /https?:\/\/(?:www\.)?youtube\.com\/watch\?v=([a-zA-Z0-9_-]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = ytWatch.exec(markdown)) !== null) add(`https://www.youtube.com/watch?v=${m[1]}`);

  // YouTube embed URLs
  const ytEmbed = /https?:\/\/(?:www\.)?youtube\.com\/embed\/([a-zA-Z0-9_-]+)/gi;
  while ((m = ytEmbed.exec(markdown)) !== null) add(`https://www.youtube.com/watch?v=${m[1]}`);

  // YouTube short URLs
  const ytShort = /https?:\/\/youtu\.be\/([a-zA-Z0-9_-]+)/gi;
  while ((m = ytShort.exec(markdown)) !== null) add(`https://www.youtube.com/watch?v=${m[1]}`);

  // Vimeo
  const vimeo = /https?:\/\/(?:player\.)?vimeo\.com\/(?:video\/)?(\d+)/gi;
  while ((m = vimeo.exec(markdown)) !== null) add(`https://vimeo.com/${m[1]}`);

  // Oracle video cloud / Brightcove
  const bcove = /https?:\/\/[^"'\s]*(?:brightcove|bcove|players\.brightcove)[^"'\s]*/gi;
  while ((m = bcove.exec(markdown)) !== null) add(m[0]);

  // Wistia
  const wistia = /https?:\/\/[^"'\s]*wistia\.(?:com|net)\/[^"'\s]*/gi;
  while ((m = wistia.exec(markdown)) !== null) add(m[0]);

  // Generic video file URLs
  const videoFiles = /https?:\/\/[^"'\s]+\.(?:mp4|webm)(?:\?[^"'\s]*)?/gi;
  while ((m = videoFiles.exec(markdown)) !== null) add(m[0]);

  return found;
}

function hashBytes(bytes: Uint8Array): string {
  let h = 2166136261;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i];
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

async function fetchImageWithContext(imageUrl: string, pageUrl: string): Promise<Response | null> {
  const origin = (() => {
    try {
      return new URL(pageUrl).origin;
    } catch {
      return "";
    }
  })();

  const commonHeaders: Record<string, string> = {
    "User-Agent": "Mozilla/5.0 (compatible; LovableScreenshotWorker/1.0)",
    "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
    "Referer": pageUrl,
  };
  if (origin) commonHeaders["Origin"] = origin;

  try {
    const res = await fetch(imageUrl, { headers: commonHeaders, redirect: "follow" });
    if (res.ok) return res;
  } catch {
    // continue to fallback fetch
  }

  try {
    const res = await fetch(imageUrl);
    if (res.ok) return res;
  } catch {
    // ignore
  }

  return null;
}

// Semantic relevance classifier for inline images
async function classifyInlineImage(
  imageBytes: Uint8Array,
  competitorName: string,
  imageUrl: string,
): Promise<boolean> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) {
    // Without vision API, use a size heuristic
    return imageBytes.length > 30000;
  }

  try {
    let binary = "";
    for (let i = 0; i < imageBytes.length; i++) binary += String.fromCharCode(imageBytes[i]);
    const base64Data = btoa(binary);
    const dataUrl = `data:image/png;base64,${base64Data}`;

    const res = await monitoredFetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-5.5",
        max_completion_tokens: 500,
        messages: [{
          role: "user",
          content: [
            { type: "image_url", image_url: { url: dataUrl } },
            {
              type: "text",
              text: `Is this image from ${competitorName}'s product documentation worth keeping? Reply KEEP or SKIP.\n\nKEEP: Software UI screenshots, configuration panels, settings screens, setup wizards, connector forms, data import/export screens, dashboards, data grids, charts, workflow editors, integration setup pages, or any screen showing the actual product interface.\n\nSKIP: Logos only (no UI context), stock photos, abstract decorative illustrations (lightbulbs, gears, networks, circuits, gradient backgrounds), tiny icons, pure text with no UI elements, photos of people's faces, headshots, portraits, speaker/author photos, team photos, generic blog header images, or hero banners.`,
            },
          ],
        }],
      }),
    }, { keyName: "LOVABLE_API_KEY", service: "lovable", edgeFunction: "screenshot-worker" });

    if (!res.ok) return imageBytes.length > 30000;
    const data = await res.json();
    const raw = (data.choices?.[0]?.message?.content || "").trim().toUpperCase();
    const keep = raw.startsWith("KEEP");
    console.log(`[semantic-gate] ${keep ? "KEEP" : "SKIP"}: ${imageUrl.slice(0, 80)} — ${raw.slice(0, 60)}`);
    return keep;
  } catch {
    return imageBytes.length > 30000;
  }
}

async function classifyScreenshot(
  screenshotUrl: string,
  competitorName: string,
  scrollPosition: number,
): Promise<{ keep: boolean; reason: string }> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) {
    return { keep: true, reason: "no_api_key_fallback" };
  }

  try {
    const imgRes = await fetch(screenshotUrl);
    if (!imgRes.ok) return { keep: true, reason: "img_download_failed" };
    const imgBytes = new Uint8Array(await imgRes.arrayBuffer());

    let binary = "";
    for (let i = 0; i < imgBytes.length; i++) binary += String.fromCharCode(imgBytes[i]);
    const base64Data = btoa(binary);
    const dataUrl = `data:image/png;base64,${base64Data}`;

    const res = await monitoredFetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-5.5",
        max_completion_tokens: 500,
        messages: [
          {
            role: "user",
            content: [
              { type: "image_url", image_url: { url: dataUrl } },
              {
                type: "text",
                text:
                  `This is a viewport screenshot at scroll position ${scrollPosition}px from ${competitorName}'s documentation. ` +
                  "Respond ONLY with KEEP or SKIP followed by a 5-word reason.\n\n" +
                  "KEEP: Contains a visible embedded product screenshot, feature demo image, " +
                  "workflow diagram, dashboard, data grid, chart, or config panel.\n\n" +
                  "SKIP: Mostly text/prose, nav menus, login forms, empty space, footer, " +
                  "cookie banners, or documentation chrome.",
              },
            ],
          },
        ],
      }),
    }, { keyName: "LOVABLE_API_KEY", service: "lovable", edgeFunction: "screenshot-worker" });

    if (!res.ok) {
      console.log(`[vision-gate] Gateway error ${res.status}`);
      return { keep: true, reason: `api_error_${res.status}` };
    }

    const data = await res.json();
    const raw = (data.choices?.[0]?.message?.content || "").trim();
    const keep = raw.toUpperCase().startsWith("KEEP");
    return { keep, reason: raw.slice(0, 80) };
  } catch (err) {
    console.error("[vision-gate] Exception:", err);
    return { keep: true, reason: "exception_fallback" };
  }
}

async function saveScreenshotsToPage(
  supabase: ReturnType<typeof createClient>,
  competitor_name: string,
  page_url: string,
  page_id: string | undefined,
  urls: string[],
) {
  if (urls.length === 0) return;

  // REPLACE screenshots entirely on each crawl (not append) to avoid stale accumulation
  const updateScreenshots = async (pageId: string) => {
    await supabase
      .from("competitor_pages")
      .update({ screenshot_urls: urls })
      .eq("id", pageId);
  };

  if (page_id) {
    await updateScreenshots(page_id);
    return;
  }

  const { data: existing } = await supabase
    .from("competitor_pages")
    .select("id")
    .eq("competitor_name", competitor_name)
    .eq("page_url", page_url)
    .maybeSingle();

  if (existing?.id) {
    await updateScreenshots(existing.id);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // --- Auth guard (shared): valid user JWT or service-role key required ---
  const authError = await requireAuth(req, corsHeaders);
  if (authError) return authError;

  try {
    const { page_url, competitor_name, page_id, image_count, category, sub_category } = await req.json();

    if (!page_url || !competitor_name) {
      return new Response(
        JSON.stringify({ success: false, error: "page_url and competitor_name required" }),
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

    const safeName = slugify(competitor_name);
    const urlSlug = page_url.replace(/https?:\/\//, "").replace(/[^a-z0-9]/gi, "-").slice(0, 50);

    const approvedUrls: string[] = [];
    let totalCaptured = 0;
    let sourceMode: "inline_images_first" | "viewport_fallback" | "none" = "none";

    // Live Firecrawl call with markdown+html+screenshot for fresh CDN URLs
    const estimatedSteps = image_count
      ? Math.min(Math.max(Math.ceil(image_count * 1.2), 2), MAX_SCROLL_STEPS)
      : 5;

    const actions: Array<Record<string, unknown>> = [
      { type: "wait", milliseconds: 2000 },
    ];
    for (let i = 0; i < estimatedSteps; i++) {
      actions.push(
        { type: "scroll", direction: "down", amount: SCROLL_INCREMENT },
        { type: "wait", milliseconds: 900 },
        { type: "screenshot" },
      );
    }

    let viewportScreenshots: string[] = [];
    let liveMarkdown = "";
    let liveHtml = "";

    try {
      const scrapeRes = await firecrawlFetch("https://api.firecrawl.dev/v1/scrape", {
        method: "POST",
        body: JSON.stringify({
          url: page_url,
          formats: ["markdown", "html", "screenshot"],
          onlyMainContent: true,
          waitFor: 3000,
          timeout: 300000,
          actions,
        }),
      });

      if (scrapeRes.ok) {
        const scrapeData = await scrapeRes.json();
        const pageData = scrapeData.data || scrapeData;
        liveMarkdown = pageData.markdown || "";
        liveHtml = pageData.html || "";
        viewportScreenshots = [...(pageData.actions?.screenshots || [])];
        if (viewportScreenshots.length === 0 && pageData.screenshot) {
          viewportScreenshots.push(pageData.screenshot);
        }
        totalCaptured = viewportScreenshots.length;
        console.log(`[screenshot-worker] Scraped: ${viewportScreenshots.length} viewport screenshots, markdown: ${liveMarkdown.length} chars, html: ${liveHtml.length} chars`);
      } else {
        const errBody = await scrapeRes.text();
        console.error(`[screenshot-worker] Firecrawl scrape failed ${scrapeRes.status}: ${errBody.slice(0, 200)}`);
      }
    } catch (err) {
      console.error("[screenshot-worker] Firecrawl scrape error:", err);
    }

    // Use live markdown+html for fresh CDN URLs (not stored raw_content which has expired SAS tokens)
    const combined = `${liveMarkdown}\n${liveHtml}`;
    console.log(`[screenshot-worker] Using live content for inline images: ${combined.length} chars`);

    // Extract and store video URLs
    const videoUrls = extractVideoUrls(combined);
    if (videoUrls.length > 0) {
      console.log(`[screenshot-worker] Found ${videoUrls.length} video URLs`);
      if (page_id) {
        const { data: existing } = await supabase
          .from("competitor_pages")
          .select("metadata")
          .eq("id", page_id)
          .single();
        const currentMeta = (existing?.metadata as Record<string, unknown>) || {};
        await supabase
          .from("competitor_pages")
          .update({ metadata: { ...currentMeta, discovered_videos: videoUrls } })
          .eq("id", page_id);
      }
    }

    // Phase A: Inline images first (preferred)
    const inlineImageUrls = extractInlineImageUrls(combined, page_url).slice(0, MAX_INLINE_IMAGES);
    console.log(`[screenshot-worker] Found ${inlineImageUrls.length} inline images`);

    const downloadResults: Array<{ index: number; imageUrl: string; bytes: Uint8Array; contentType: string } | null> = await Promise.all(
      inlineImageUrls.map(async (imageUrl, i) => {
        try {
          console.log(`[screenshot-worker] Downloading inline ${i + 1}: ${imageUrl.slice(0, 120)}`);
          const imgRes = await fetchImageWithContext(imageUrl, page_url);
          if (!imgRes) return null;
          const contentType = imgRes.headers.get("content-type") || "image/png";
          if (!contentType.startsWith("image/")) return null;
          const imageBytes = new Uint8Array(await imgRes.arrayBuffer());
          if (imageBytes.length < 15000) {
            console.log(`[screenshot-worker] Skipping small inline ${i + 1} (${imageBytes.length} bytes)`);
            return null;
          }
          return { index: i, imageUrl, bytes: imageBytes, contentType };
        } catch {
          return null;
        }
      })
    );

    const validDownloads = downloadResults.filter((d): d is NonNullable<typeof d> => d !== null);

    const classifyResults = await Promise.all(
      validDownloads.map(async (dl) => {
        console.log(`[screenshot-worker] Inline ${dl.index + 1}: ${dl.bytes.length} bytes, classifying...`);
        const isRelevant = await classifyInlineImage(dl.bytes, competitor_name, dl.imageUrl);
        if (!isRelevant) {
          console.log(`[screenshot-worker] Rejected inline ${dl.index + 1} by semantic gate`);
        }
        return { ...dl, isRelevant };
      })
    );

    for (const result of classifyResults) {
      if (!result.isRelevant) continue;
      const extension = result.contentType.includes("jpeg") ? "jpg" : result.contentType.includes("webp") ? "webp" : "png";
      const filePath = `${safeName}/inline-${result.index + 1}-${urlSlug}-${Date.now()}.${extension}`;

      const { error: uploadErr } = await supabase.storage
        .from("competitor-screenshots")
        .upload(filePath, result.bytes, { contentType: result.contentType, upsert: true });
      if (uploadErr) continue;

      const { data: pubUrl } = supabase.storage.from("competitor-screenshots").getPublicUrl(filePath);
      const publicUrl = pubUrl?.publicUrl || "";
      if (publicUrl) {
        approvedUrls.push(publicUrl);
        sourceMode = "inline_images_first";
        console.log(`[screenshot-worker] Saved inline ${result.index + 1}`);
      }
    }

    // Phase B: If no inline images saved, use viewport screenshots from the SAME scrape (no second API call)
    if (approvedUrls.length === 0 && viewportScreenshots.length > 0) {
      console.log(`[screenshot-worker] Inline failed, using ${viewportScreenshots.length} viewport screenshots`);
      sourceMode = "viewport_fallback";

      const seenHashes = new Set<string>();

      for (let i = 0; i < viewportScreenshots.length; i++) {
        const ssData = viewportScreenshots[i];
        const scrollPx = (i + 1) * SCROLL_INCREMENT;

        let screenshotBytes: Uint8Array;

        if (ssData.startsWith("http")) {
          try {
            const imgRes = await fetch(ssData);
            if (!imgRes.ok) continue;
            screenshotBytes = new Uint8Array(await imgRes.arrayBuffer());
          } catch { continue; }
        } else if (ssData.startsWith("data:image/")) {
          try {
            const base64Part = ssData.split(",")[1];
            if (!base64Part) continue;
            const binaryStr = atob(base64Part);
            screenshotBytes = new Uint8Array(binaryStr.length);
            for (let j = 0; j < binaryStr.length; j++) screenshotBytes[j] = binaryStr.charCodeAt(j);
          } catch { continue; }
        } else if (/^[A-Za-z0-9+/=]/.test(ssData) && ssData.length > 1000) {
          try {
            const binaryStr = atob(ssData);
            screenshotBytes = new Uint8Array(binaryStr.length);
            for (let j = 0; j < binaryStr.length; j++) screenshotBytes[j] = binaryStr.charCodeAt(j);
          } catch { continue; }
        } else {
          continue;
        }

        if (screenshotBytes.length < 8000) continue;

        const bytesHash = hashBytes(screenshotBytes);
        if (seenHashes.has(bytesHash)) {
          console.log(`[screenshot-worker] Skipping duplicate at ${scrollPx}px`);
          continue;
        }
        seenHashes.add(bytesHash);

        const filePath = `${safeName}/feature-${scrollPx}px-${urlSlug}-${Date.now()}.png`;
        const { error: uploadErr } = await supabase.storage
          .from("competitor-screenshots")
          .upload(filePath, screenshotBytes, { contentType: "image/png", upsert: true });
        if (uploadErr) continue;

        const { data: pubUrl } = supabase.storage.from("competitor-screenshots").getPublicUrl(filePath);
        const publicUrl = pubUrl?.publicUrl || "";
        if (!publicUrl) continue;

        const verdict = await classifyScreenshot(publicUrl, competitor_name, scrollPx);
        if (!verdict.keep) {
          await supabase.storage.from("competitor-screenshots").remove([filePath]);
          console.log(`[screenshot-worker] Rejected viewport at ${scrollPx}px: ${verdict.reason}`);
          continue;
        }

        approvedUrls.push(publicUrl);
      }
    }

    await saveScreenshotsToPage(supabase, competitor_name, page_url, page_id, approvedUrls);

    if (approvedUrls.length > 0) {
      let resolvedCategory = category || "";
      let resolvedSubCategory = sub_category || "";
      if (!resolvedCategory || !resolvedSubCategory) {
        const { data: comp } = await supabase
          .from("competitors")
          .select("category, sub_category")
          .eq("name", competitor_name)
          .maybeSingle();
        if (comp) {
          resolvedCategory = resolvedCategory || comp.category;
          resolvedSubCategory = resolvedSubCategory || comp.sub_category;
        }
      }

      const mediaEntries = approvedUrls.map((url, i) => {
        const isInline = url.includes("/inline-");
        const sourceImageUrl = isInline && classifyResults[i]
          ? (classifyResults as Array<{ imageUrl?: string }>)[i]?.imageUrl || page_url
          : page_url;
        return {
          type: isInline ? "inline_product_screenshot" : "viewport_screenshot",
          permanent_url: url,
          source_url: sourceImageUrl,
          page_url: page_url,
          competitor: competitor_name,
          product_area: resolvedCategory,
          product_sub_area: resolvedSubCategory,
          captured_at: new Date().toISOString(),
        };
      });

      const mediaBlock = [
        "\n\n<!-- APPROVED_MEDIA_START -->",
        JSON.stringify({ competitor: competitor_name, product_area: resolvedCategory, product_sub_area: resolvedSubCategory, approved_media: mediaEntries, updated_at: new Date().toISOString() }),
        "<!-- APPROVED_MEDIA_END -->",
      ].join("\n");

      const updateQuery = page_id
        ? supabase.from("competitor_pages").select("raw_content").eq("id", page_id).maybeSingle()
        : supabase.from("competitor_pages").select("raw_content").eq("competitor_name", competitor_name).eq("page_url", page_url).maybeSingle();
      const { data: currentPage } = await updateQuery;
      let existingContent = currentPage?.raw_content || "";
      existingContent = existingContent.replace(/\n?\n?<!-- APPROVED_MEDIA_START -->[\s\S]*?<!-- APPROVED_MEDIA_END -->/g, "");
      const newRawContent = existingContent + mediaBlock;

      if (page_id) {
        await supabase.from("competitor_pages").update({ raw_content: newRawContent }).eq("id", page_id);
      } else {
        await supabase.from("competitor_pages").update({ raw_content: newRawContent })
          .eq("competitor_name", competitor_name).eq("page_url", page_url);
      }
      console.log(`[screenshot-worker] Stored ${mediaEntries.length} approved media entries with context in raw_content`);
    }

    // Explicit contract: each approved asset is tagged with its capture_type so
    // downstream consumers (runTargetedLiveCrawl, persistNewMediaToGallery) do
    // NOT have to substring-sniff filenames to guess inline-vs-fallback.
    const approvedAssets = approvedUrls.map((url) => ({
      url,
      capture_type: sourceMode === "inline_images_first" ? "inline" : "fallback" as "inline" | "fallback",
    }));

    return new Response(
      JSON.stringify({
        success: true,
        screenshot_urls: approvedUrls, // backwards compat
        approved_assets: approvedAssets,
        total_captured: totalCaptured,
        total_approved: approvedUrls.length,
        source_mode: sourceMode,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[screenshot-worker] Error:", err);
    return new Response(
      JSON.stringify({ success: false, error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
