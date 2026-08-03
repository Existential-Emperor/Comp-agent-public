import { requireAuth } from "../_shared/auth.ts";
import { firecrawlFetch, hasFirecrawlKey } from "../_shared/firecrawl-keys.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Media Quality Agent
 * 
 * A semantic background agent that:
 * 1. Evaluates all candidate images using AI vision — rates each 1-10 for product UI quality
 * 2. Rejects any media scoring below 7
 * 3. Proactively discovers relevant YouTube videos for the competitor + product area
 * 
 * Input: { competitor, category, subCategory, mediaItems: Array<{ url, label, type }> }
 * Output: { filteredMedia: Array<{ url, label, type, score, reasoning }>, discoveredVideos: Array<{ url, title }> }
 */

interface MediaItem {
  url: string;
  label: string;
  type: "image" | "video" | "gif";
}

interface RatedMedia extends MediaItem {
  score: number;
  reasoning: string;
}

interface MediaQualityResult {
  filteredMedia: RatedMedia[];
  rejectedMedia: RatedMedia[];
  unratedMedia: RatedMedia[];
  discoveredVideos: { url: string; title: string; score: number }[];
}

// Rate a batch of images using Gemini vision
async function rateImageBatch(
  images: MediaItem[],
  competitor: string,
  subCategory: string,
  category: string,
): Promise<RatedMedia[]> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY || images.length === 0) return [];

  // Build content with image URLs for vision model
  const imageDescriptions = images.map((img, i) => 
    `[Image ${i + 1}]: ${img.url}\nLabel: ${img.label}`
  ).join("\n\n");

  const prompt = `You are a Media Quality Judge for competitive intelligence reports about enterprise software (FP&A/EPM tools).

CONTEXT: We are analyzing "${competitor}" vs Workday Adaptive Planning for the product area: "${subCategory}" (${category}).

TASK: Rate each image below on a scale of 1-10 for its value in a competitive analysis Visual Overview. 

SCORING CRITERIA:
- 9-10: Actual product UI screenshot showing the software interface, dashboards, configuration screens, or feature workflows. These are the gold standard. Also includes official product tour images from enterprise vendors (e.g. Oracle /a/ocom/img/, SAP product images) showing module features, architecture diagrams with product components, or annotated feature screenshots.
- 7-8: Product-related diagrams, architecture visuals, feature comparison graphics, or demo screenshots that clearly show product capabilities. Includes enterprise vendor product page images that illustrate specific module functionality (financial planning, consolidation, reporting dashboards, etc.) even if they are polished marketing renders of the product UI.
- 5-6: Marketing graphics with some product imagery but mostly promotional. Or product images that are too small/blurry to be useful.
- 3-4: Generic marketing banners, header images, promotional graphics with no product UI visible.
- 1-2: Icons, logos, spacer images, text-heavy documentation page screenshots, install instruction pages, marketplace listing pages with no product UI.

CRITICAL RULES:
- Screenshots of documentation/help pages that are mostly TEXT (install guides, API docs, text tutorials) should score 1-3
- Screenshots of marketplace listing pages (app stores, integration directories) should score 1-3
- Images showing actual SOFTWARE INTERFACES (forms, dashboards, grids, charts, configuration panels) should score 7-10
- Official product tour/feature images from enterprise vendors that show UI mockups, module screenshots, or annotated product views should score 8-10 — these are HIGHLY VALUABLE for competitive analysis
- Marketing hero images with vague product mockups score 4-5
- Stock photos, team photos, headshots, portrait photos, profile pictures, speaker photos, event photos, office images, abstract illustrations, and decorative graphics should score 1-2 — these are NEVER useful for competitive analysis. A photo of a person's face is ALWAYS score 1.
- Website navigation screenshots, cookie banners, login pages, error pages, and generic web chrome should score 1-2
- Blog post header images, social media cards, and promotional banners without product UI should score 1-3
- **SUB-AREA RELEVANCE IS MANDATORY**: The image MUST specifically show functionality related to "${subCategory}" to score above 6. Even if an image is a valid product UI screenshot, if it shows a DIFFERENT feature area (e.g. an anomaly detection dashboard when the sub-area is "Dashboards & Visualization", or a forecasting tool when the sub-area is "Ad-Hoc Analysis"), it MUST score 4-5 maximum because it is MISCLASSIFIED.
- Examples of misclassification: A "Signals anomaly detection" screenshot filed under "Dashboards & Visualization" → score 4. A "Predictive forecasting" screenshot filed under "Ad-Hoc Analysis" → score 4. The image content must MATCH the sub-area label.
- The image MUST be relevant to "${competitor}" to score above 6

IMAGES TO RATE:
${imageDescriptions}

Respond with a JSON array. Each element: { "index": <1-based>, "score": <1-10>, "reasoning": "<brief explanation>" }
Return ONLY the JSON array, no other text.`;

  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${LOVABLE_API_KEY}` },
      body: JSON.stringify({
        model: "openai/gpt-5.5",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              // Include image URLs as image_url content parts for vision
              ...images.map(img => ({
                type: "image_url" as const,
                image_url: { url: img.url },
              })),
            ],
          },
        ],
        max_completion_tokens: 2000,
      }),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      console.error(`Vision rating failed: ${res.status} ${errBody.slice(0, 400)}`);
      // Mark as unrated (score 0) so caller can apply entity-matched fallback
      return images.map(img => ({ ...img, score: 0, reasoning: `unrated:rater_http_${res.status}` }));
    }

    const data = await res.json();
    const rawContent = data.choices?.[0]?.message?.content || "";

    // Parse JSON from response
    const jsonMatch = rawContent.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.error("Failed to parse vision rating JSON:", rawContent.slice(0, 200));
      return images.map(img => ({ ...img, score: 0, reasoning: "unrated:parse_error" }));
    }

    const ratings = JSON.parse(jsonMatch[0]) as Array<{ index: number; score: number; reasoning: string }>;
    
    return images.map((img, i) => {
      const rating = ratings.find(r => r.index === i + 1);
      let score = rating?.score ?? 5;
      let reasoning = rating?.reasoning ?? "No rating received";

      // Apply minimum floor score for known enterprise product image CDNs
      // These are official product UI screenshots that should always pass
      const knownProductImagePatterns = [
        /oracle\.com\/a\/ocom\/img\//i,           // Oracle product tour images
        /sap\.com\/dam\/application\//i,           // SAP product images
        /cloud\.oracle\.com\/.*\.(png|jpg|webp)/i, // Oracle Cloud product images
        /onestreamsoftware\.com\/.*product/i,       // OneStream product images
      ];
      const isKnownProductImage = knownProductImagePatterns.some(p => p.test(img.url));
      if (isKnownProductImage && score < 7) {
        console.log(`Boosting known enterprise product image from ${score} to 8: ${img.url.split("/").pop()}`);
        score = 8;
        reasoning = `${reasoning} [Boosted: recognized as official enterprise vendor product image]`;
      }

      return {
        ...img,
        score,
        reasoning,
      };
    });
  } catch (err) {
    console.error("Vision rating error:", err);
    return images.map(img => ({ ...img, score: 0, reasoning: `unrated:exception:${err instanceof Error ? err.message : String(err)}` }));
  }
}

// Rate YouTube videos for relevance using title/metadata analysis
async function rateVideos(
  videos: MediaItem[],
  competitor: string,
  subCategory: string,
  category: string,
): Promise<RatedMedia[]> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY || videos.length === 0) return [];

  const videoDescriptions = videos.map((v, i) => 
    `[Video ${i + 1}]: ${v.url}\nTitle: ${v.label}`
  ).join("\n\n");

  const prompt = `You are a Media Quality Judge for competitive intelligence reports.

CONTEXT: Analyzing "${competitor}" for product area: "${subCategory}" (${category}).

Rate each video 1-10 for relevance to a competitive analysis:
- 9-10: Official product demo, feature walkthrough, or tutorial directly showing the product capabilities for "${subCategory}"
- 7-8: Product overview, webinar, or conference talk demonstrating the product with relevant features
- 5-6: General company video, tangentially related to the product area
- 3-4: Marketing/promotional video with little product substance
- 1-2: Unrelated video, wrong product, or wrong competitor

VIDEOS:
${videoDescriptions}

Respond with a JSON array: [{ "index": <1-based>, "score": <1-10>, "reasoning": "<brief>" }]
Return ONLY the JSON array.`;

  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${LOVABLE_API_KEY}` },
      body: JSON.stringify({
        model: "openai/gpt-5.5",
        messages: [{ role: "user", content: prompt }],
        max_completion_tokens: 1500,
      }),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      console.error(`Video rating failed: ${res.status} ${errBody.slice(0, 400)}`);
      // Rater error: mark as 'unrated' so caller (media-helpers) can decide whether
      // to allow entity-matched candidates through instead of silently dropping.
      return videos.map(v => ({ ...v, score: 0, reasoning: `unrated:rater_http_${res.status}` }));
    }

    const data = await res.json();
    const rawContent = data.choices?.[0]?.message?.content || "";
    const jsonMatch = rawContent.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return videos.map(v => ({ ...v, score: 0, reasoning: "unrated:parse_error" }));
    }

    const ratings = JSON.parse(jsonMatch[0]) as Array<{ index: number; score: number; reasoning: string }>;
    return videos.map((v, i) => {
      const rating = ratings.find(r => r.index === i + 1);
      return { ...v, score: rating?.score ?? 0, reasoning: rating?.reasoning ?? "unrated:no_rating" };
    });
  } catch (err) {
    console.error("Video rating error:", err);
    return videos.map(v => ({ ...v, score: 0, reasoning: `unrated:exception:${err instanceof Error ? err.message : String(err)}` }));
  }
}

// Proactively discover YouTube videos for a competitor + product area
async function discoverYouTubeVideos(
  competitor: string,
  category: string,
  subCategory: string,
  existingVideoIds: Set<string>,
): Promise<{ url: string; title: string; score: number }[]> {
  if (!hasFirecrawlKey()) return [];

  const isFullProduct = category === "Full Product";
  const searchQueries = isFullProduct
    ? [
        `${competitor} product demo site:youtube.com`,
        `${competitor} EPM planning overview walkthrough site:youtube.com`,
        `"${competitor}" financial planning demo tutorial site:youtube.com`,
      ]
    : [
        `${competitor} ${subCategory} demo site:youtube.com`,
        `${competitor} ${subCategory} tutorial walkthrough site:youtube.com`,
        `"${competitor}" ${category} ${subCategory} product overview site:youtube.com`,
      ];

  const discovered: { url: string; title: string }[] = [];
  const seenIds = new Set(existingVideoIds);

  for (const query of searchQueries) {
    if (discovered.length >= 6) break;
    try {
      const res = await firecrawlFetch("https://api.firecrawl.dev/v1/search", {
        method: "POST",
        body: JSON.stringify({ query, limit: 5 }),
      });
      if (!res.ok) continue;
      const data = await res.json();
      for (const result of (data.data || data.results || [])) {
        if (!result.url) continue;
        const ytMatch = result.url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/);
        if (ytMatch && !seenIds.has(ytMatch[1])) {
          seenIds.add(ytMatch[1]);
          discovered.push({
            url: `https://www.youtube.com/watch?v=${ytMatch[1]}`,
            title: result.title || `${competitor} ${subCategory} video`,
          });
        }
      }
    } catch (e) {
      console.error("YT discovery error:", e);
    }
  }

  // Rate discovered videos for relevance
  if (discovered.length === 0) return [];

  const videoItems: MediaItem[] = discovered.map(v => ({ url: v.url, label: v.title, type: "video" as const }));
  const rated = await rateVideos(videoItems, competitor, subCategory, category);

  return rated
    .filter(v => v.score >= 7)
    .map(v => ({ url: v.url, title: v.label, score: v.score }))
    .sort((a, b) => b.score - a.score);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // --- Auth guard (shared): valid user JWT or service-role key required ---
  const authError = await requireAuth(req, corsHeaders);
  if (authError) return authError;

  try {
    const { competitor, category, subCategory, mediaItems, existingVideoIds } = await req.json() as {
      competitor: string;
      category: string;
      subCategory: string;
      mediaItems: MediaItem[];
      existingVideoIds?: string[];
    };

    // ── Deduplication: remove duplicate URLs before scoring ──
    const seenUrls = new Set<string>();
    const deduped: MediaItem[] = [];
    const duplicates: MediaItem[] = [];
    for (const item of mediaItems) {
      // Normalize URL: strip query params for comparison (keeps path-based uniqueness)
      const normalizedUrl = item.url.split("?")[0].split("#")[0].toLowerCase();
      if (seenUrls.has(normalizedUrl)) {
        duplicates.push(item);
      } else {
        seenUrls.add(normalizedUrl);
        deduped.push(item);
      }
    }

    if (duplicates.length > 0) {
      console.log(`Media Quality Agent: removed ${duplicates.length} duplicate URLs before scoring`);
    }

    console.log(`Media Quality Agent: evaluating ${deduped.length} items for "${competitor}" / "${subCategory}" (${duplicates.length} duplicates removed)`);

    // ── URL-based pre-filter: reject known non-product image patterns ──
    const NON_PRODUCT_URL_PATTERNS = [
      // Profile photos / avatars / headshots
      /\/avatars?\//i,
      /\/profile[_-]?(?:pic|photo|image)/i,
      /\/people\//i,
      /\/authors?\//i,
      /\/members?\//i,
      /\/user[_-]?(?:photo|image|pic|avatar)/i,
      /gravatar\.com/i,
      /\.gravatar\./i,
      // Community platform profile images
      /community\..*\/t5\/image\/.*user/i,
      /community\..*\/image\/.*serverpage.*type=PROFILE/i,
      /\/t5\/.*\/image-id\/.*user/i,
      /lithium\.com.*profile/i,
      // Social media thumbnails & icons
      /pbs\.twimg\.com/i,
      /platform-lookaside\.fbsbx\.com/i,
      /media\.licdn\.com\/dms\/image.*profile/i,
      // Generic icons, favicons, spacers
      /\/favicon/i,
      /\/spacer\./i,
      /1x1\.(png|gif|jpg)/i,
      /pixel\.(png|gif|jpg)/i,
      /\/blank\.(png|gif|jpg)/i,
      // Stock photo sites
      /istockphoto\.com/i,
      /shutterstock\.com/i,
      /gettyimages\.com/i,
      /unsplash\.com/i,
      /pexels\.com/i,
      /stock[_-]?photo/i,
      // Decorative stock illustrations (asset-name patterns)
      /\b(lightbulb|light-bulb|innovation|brainstorm|idea[s]?-?graphic|abstract-?bg|hero-?image|banner-?bg)\b/i,
      // Headshots / author / speaker portraits in asset-name
      /\b(headshot|portrait|profile-?photo|team-?member|speaker|author-?photo)\b/i,
    ];

    const preFiltered: MediaItem[] = [];
    const urlRejected: MediaItem[] = [];
    for (const item of deduped) {
      if (item.type === "video") {
        preFiltered.push(item);
        continue;
      }
      const rejected = NON_PRODUCT_URL_PATTERNS.some(p => p.test(item.url));
      if (rejected) {
        urlRejected.push(item);
      } else {
        preFiltered.push(item);
      }
    }

    if (urlRejected.length > 0) {
      console.log(`Media Quality Agent: pre-filtered ${urlRejected.length} non-product URLs:`);
      for (const r of urlRejected) {
        console.log(`  🚫 URL blocklist: ${r.url.slice(0, 120)}`);
      }
    }

    // Separate images and videos
    const images = preFiltered.filter(m => m.type === "image" || m.type === "gif");
    const videos = preFiltered.filter(m => m.type === "video");

    // Process all in parallel: rate images, rate videos, discover new YT videos
    const BATCH_SIZE = 5; // Rate images in batches of 5 for vision model efficiency
    const imageBatches: MediaItem[][] = [];
    for (let i = 0; i < images.length; i += BATCH_SIZE) {
      imageBatches.push(images.slice(i, i + BATCH_SIZE));
    }

    const existingIds = new Set(existingVideoIds || []);
    // Extract IDs from existing video URLs
    for (const v of videos) {
      const match = v.url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/);
      if (match) existingIds.add(match[1]);
    }

    const [imageRatings, videoRatings, discoveredVideos] = await Promise.all([
      Promise.all(imageBatches.map(batch => rateImageBatch(batch, competitor, subCategory, category))).then(r => r.flat()),
      rateVideos(videos, competitor, subCategory, category),
      discoverYouTubeVideos(competitor, category, subCategory, existingIds),
    ]);

    const allRated = [...imageRatings, ...videoRatings];
    const QUALITY_THRESHOLD = 7;

    // Score 0 = unrated (rater error / parse error / exception). These are
    // surfaced separately so callers can apply an entity-matched fallback
    // instead of dropping the only relevant asset.
    const filteredMedia = allRated.filter(m => m.score >= QUALITY_THRESHOLD);
    const unratedMedia = allRated.filter(m => m.score === 0);
    const rejectedMedia = [
      ...allRated.filter(m => m.score > 0 && m.score < QUALITY_THRESHOLD),
      ...urlRejected.map(m => ({ ...m, score: 1, reasoning: "URL blocklist: non-product image pattern detected" })),
    ];

    console.log(`Media Quality Agent results:`);
    console.log(`  ✅ Passed (≥${QUALITY_THRESHOLD}): ${filteredMedia.length}`);
    console.log(`  ❌ Rejected (<${QUALITY_THRESHOLD}): ${rejectedMedia.length} (${urlRejected.length} URL pre-filtered)`);
    console.log(`  ⚠️  Unrated (rater error): ${unratedMedia.length}`);
    console.log(`  🎥 Discovered YT videos: ${discoveredVideos.length}`);

    for (const m of filteredMedia) {
      console.log(`  ✅ [${m.score}/10] ${m.type}: ${m.label.slice(0, 80)} — ${m.reasoning}`);
    }
    for (const m of rejectedMedia) {
      console.log(`  ❌ [${m.score}/10] ${m.type}: ${m.label.slice(0, 80)} — ${m.reasoning}`);
    }
    for (const m of unratedMedia) {
      console.log(`  ⚠️ [unrated] ${m.type}: ${m.label.slice(0, 80)} — ${m.reasoning}`);
    }
    for (const v of discoveredVideos) {
      console.log(`  🎥 [${v.score}/10] YT: ${v.title.slice(0, 80)}`);
    }

    const result: MediaQualityResult = { filteredMedia, rejectedMedia, unratedMedia, discoveredVideos };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Media Quality Agent error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
