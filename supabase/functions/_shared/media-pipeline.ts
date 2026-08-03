// ───────────────────────────────────────────────────────────────────────────
// MEDIA PIPELINE — standalone, decoupled from the synthesis (text) pipeline.
//
// WHY THIS EXISTS
// Previously the media-gathering logic lived inline in chat-analysis/index.ts
// and was (a) awaited end-to-end before the LLM could start, and (b) projected
// into the prose response as one monolithic "## Visual Overview" blob that the
// client mounted in a single synchronous React commit — the "tab hang at end of
// stream" failure class. This module extracts the pipeline into its own function
// so the orchestrator can:
//   1. start media gathering in PARALLEL with the synthesizer, and
//   2. stream structured media to the client on its own SSE channel (`media`),
//      letting the client render the gallery progressively.
//
// FAST / FULL SPLIT (hybrid grounding)
// `startMediaGather` kicks off the FAST sources (gallery DB lookup + YouTube)
// immediately. These are cheap/pre-verified and form the grounding manifest the
// synthesizer sees. The SLOW sources (live crawls + AI quality gate) run via
// `runFull(...)` which the orchestrator launches without awaiting, so they
// overlap LLM generation and stream in as they resolve.
//
// ON-DEMAND
// `gatherOnDemandMedia` is the same pipeline scoped to a single agent-issued
// query (the `<<NEEDS_MEDIA: ...>>` control-token seam), so the agent can pull a
// specific image/video mid-answer without a separate orchestration layer.
// ───────────────────────────────────────────────────────────────────────────
import {
  isGalleryOnlyCompetitor,
  getGalleryMedia,
  searchYouTubeVideos,
  crawlForRelevantMedia,
  runTargetedLiveCrawl,
  handleFullProductMediaThreshold,
  shouldOverrideGalleryOnly,
  filterMediaWithQualityAgent,
  persistNewMediaToGallery,
  parseMediaFromContext,
  mediaDedupeKey,
  type GalleryMediaResult,
  type ParsedMediaItem,
} from "./media-helpers.ts";

export interface MediaQueryIntent {
  scope: "narrow" | "broad";
  entities: string[];
  asksMedia: boolean;
}

export interface MediaGatherParams {
  competitors: string[];
  category: string;
  subCategory: string;
  queryIntent: MediaQueryIntent;
  /** Forwarded to the orchestrator's SSE `progress` channel. */
  onProgress?: (step: string) => void;
}

/** Structured media item streamed to the client on the dedicated `media` SSE channel. */
export interface MediaItemPayload {
  url: string;
  label: string;
  type: "image" | "video" | "gif";
  pageUrl?: string;
}

export interface MediaFastResult {
  /** Pre-verified gallery + YouTube context, used for the grounding manifest. */
  mediaContext: string;
  items: MediaItemPayload[];
  galleryResults: GalleryMediaResult[];
  /** Normalized gallery URLs — slow phase de-dupes crawl hits against these. */
  galleryUrls: Set<string>;
  /** Raw gallery media lines (already inline-first ordered), for the gate. */
  galleryMediaLines: string[];
}

export interface LiveCrawlMetadata {
  comp: string;
  queries: string[];
  mediaCount: number;
  intelSnippetCount: number;
  pageScreenshotsCount: number;
}

export interface MediaFullResult {
  /** Final, quality-gated media context (gallery bypasses the gate). */
  mediaContext: string;
  items: MediaItemPayload[];
  galleryResults: GalleryMediaResult[];
  liveCrawlMetadata: LiveCrawlMetadata[];
}

export interface MediaGatherHandle {
  /** Resolves once gallery + YouTube are gathered (fast). */
  fast: Promise<MediaFastResult>;
  /**
   * Runs the slow phase (live crawls + quality gate). `bundledMediaParts` are
   * media strings that came bundled with the intelligence brief (cached/live
   * intel), threaded in here so they are quality-gated and de-duped alongside
   * crawl hits rather than recomputed.
   */
  runFull: (bundledMediaParts: string[]) => Promise<MediaFullResult>;
}

function toPayload(items: ParsedMediaItem[]): MediaItemPayload[] {
  return items.map((m) => ({ url: m.url, label: m.label, type: m.type, pageUrl: m.pageUrl }));
}

const normalizeUrl = (u: string) => mediaDedupeKey(u);

/**
 * Start the media pipeline. The FAST phase begins immediately; the caller drives
 * the SLOW phase via the returned `runFull`.
 */
export function startMediaGather(params: MediaGatherParams): MediaGatherHandle {
  const { competitors, category, subCategory, queryIntent, onProgress } = params;
  const isFullProduct = category === "Full Product" && subCategory === "Full Product";

  // The fast phase starts eagerly (parallel with the caller's intel gathering),
  // so it must NEVER reject — an unhandled rejection on a not-yet-awaited promise
  // can crash the Deno isolate. On failure it resolves to an empty result.
  const fast: Promise<MediaFastResult> = (async () => {
    try {
      onProgress?.("Checking media gallery for existing assets...");
      const galleryResults = await Promise.all(
        competitors.map((comp) =>
          getGalleryMedia(comp, category, subCategory, { scope: queryIntent.scope, entities: queryIntent.entities }),
        ),
      );

      const galleryMediaLines: string[] = [];
      const galleryUrls = new Set<string>();
      for (const gallery of galleryResults) {
        for (const line of gallery.galleryMedia) galleryMediaLines.push(line);
        for (const url of gallery.galleryUrls) galleryUrls.add(url);
      }

      onProgress?.("Searching YouTube for product videos...");
      const youtubeResults = await Promise.all(competitors.map((comp) => searchYouTubeVideos(comp, category, subCategory)));
      const youtubeRefs: string[] = [];
      for (const refs of youtubeResults) youtubeRefs.push(...refs);

      const parts: string[] = [];
      if (galleryMediaLines.length > 0) {
        parts.push(`--- GALLERY MEDIA (pre-verified) ---\n${galleryMediaLines.join("\n")}\n--- END GALLERY MEDIA ---`);
      }
      if (youtubeRefs.length > 0) {
        parts.push(`--- YOUTUBE VIDEOS ---\n${youtubeRefs.join("\n")}\n--- END YOUTUBE VIDEOS ---`);
      }
      const mediaContext = parts.join("\n\n");

      return {
        mediaContext,
        items: toPayload(parseMediaFromContext(mediaContext)),
        galleryResults,
        galleryUrls,
        galleryMediaLines,
      };
    } catch (e) {
      console.error("media fast phase error:", e);
      return { mediaContext: "", items: [], galleryResults: [], galleryUrls: new Set<string>(), galleryMediaLines: [] };
    }
  })();

  const runFull = async (bundledMediaParts: string[]): Promise<MediaFullResult> => {
    const fastResult = await fast;
    const { galleryResults, galleryUrls, galleryMediaLines } = fastResult;

    // Start from gallery + youtube + bundled intel media.
    const allMediaParts: string[] = [];
    if (fastResult.mediaContext) allMediaParts.push(fastResult.mediaContext);
    for (const part of bundledMediaParts) if (part) allMediaParts.push(part);

    // --- Crawl decisions (gallery-only is the default; narrow-intent misses
    // override to a targeted live crawl). Ported verbatim from the inline path. ---
    const liveCrawlOverrides: { comp: string; entities: string[] }[] = [];
    const crawlDecisions: { comp: string; shouldCrawl: boolean }[] = [];
    for (let ci = 0; ci < competitors.length; ci++) {
      const comp = competitors[ci];
      const gallery = galleryResults[ci];
      const galleryHits = gallery.count;
      const inlineGalleryHits = gallery.inlineCount ?? galleryHits;
      if (isGalleryOnlyCompetitor(comp)) {
        const override = shouldOverrideGalleryOnly(
          { scope: queryIntent.scope, entities: queryIntent.entities, asksMedia: queryIntent.asksMedia },
          galleryHits,
          inlineGalleryHits,
        );
        if (override) liveCrawlOverrides.push({ comp, entities: queryIntent.entities });
        crawlDecisions.push({ comp, shouldCrawl: false });
        continue;
      }
      // PRODUCT RULE: the live crawl exists only to find media for competitors
      // that have NONE in the gallery. If the gallery already returned media for
      // this competitor, skip the crawl entirely — regardless of Full Product
      // thresholds. Live crawl applies only when galleryHits === 0.
      if (galleryHits > 0) {
        crawlDecisions.push({ comp, shouldCrawl: false });
      } else if (isFullProduct) {
        const threshold = await handleFullProductMediaThreshold(comp, gallery);
        crawlDecisions.push({ comp, shouldCrawl: !threshold.skipCrawl });
      } else {
        crawlDecisions.push({ comp, shouldCrawl: true });
      }
    }

    const liveCrawlMetadata: LiveCrawlMetadata[] = [];

    // Targeted live crawl for gallery-only overrides (narrow intent + zero hits).
    if (liveCrawlOverrides.length > 0) {
      onProgress?.(`Targeted live crawl for ${liveCrawlOverrides.map((o) => o.comp).join(", ")} (${queryIntent.entities.join(", ")})...`);
      const overrideResults = await Promise.all(
        liveCrawlOverrides.map((o) => runTargetedLiveCrawl(o.comp, o.entities, category, subCategory)),
      );
      for (let i = 0; i < liveCrawlOverrides.length; i++) {
        const o = liveCrawlOverrides[i];
        const r = overrideResults[i];
        liveCrawlMetadata.push({
          comp: o.comp,
          queries: r.queriesUsed,
          mediaCount: r.mediaRefs.length,
          intelSnippetCount: r.intelligenceSnippets?.length ?? 0,
          pageScreenshotsCount: r.pageScreenshotsCount ?? 0,
        });
        if (r.mediaRefs.length > 0) {
          allMediaParts.push(`--- TARGETED LIVE CRAWL (${o.comp} / ${o.entities.join(", ")}) ---\n${r.mediaRefs.join("\n")}\n--- END TARGETED LIVE CRAWL ---`);
        }
      }
    }

    // Supplemental relevant-media crawl for competitors that need it.
    const competitorsNeedingCrawl = crawlDecisions.filter((d) => d.shouldCrawl).map((d) => d.comp);
    if (competitorsNeedingCrawl.length > 0) {
      onProgress?.(`Crawling for ${subCategory} visuals (${competitorsNeedingCrawl.length} competitors)...`);
      const crawlResults = await Promise.all(competitorsNeedingCrawl.map((comp) => crawlForRelevantMedia(comp, category, subCategory)));
      for (const liveCrawl of crawlResults) {
        if (liveCrawl.mediaRefs.length > 0) {
          const newMediaRefs = liveCrawl.mediaRefs.filter((ref) => {
            const urlMatch = ref.match(/(https?:\/\/[^\s)]+)/);
            return !urlMatch || !galleryUrls.has(normalizeUrl(urlMatch[1]));
          });
          if (newMediaRefs.length > 0) {
            allMediaParts.push(`--- LIVE CRAWL MEDIA (new) ---\n${newMediaRefs.join("\n")}\n--- END LIVE CRAWL MEDIA ---`);
          }
        }
      }
    }

    let mediaContext = allMediaParts.join("\n\n");

    // --- AI media quality gate (gallery bypasses; non-gallery is scored ≥7). ---
    if (mediaContext) {
      onProgress?.("AI media quality agent evaluating visuals...");
      try {
        mediaContext = await applyQualityGate(mediaContext, galleryMediaLines, competitors, category, subCategory, queryIntent);
      } catch (mqErr) {
        console.error("Media Quality Agent failed, using unfiltered media:", mqErr);
      }
    }

    return {
      mediaContext,
      items: toPayload(parseMediaFromContext(mediaContext)),
      galleryResults,
      liveCrawlMetadata,
    };
  };

  return { fast, runFull };
}

/**
 * Quality gate: gallery lines bypass (pre-verified); everything else is filtered
 * by the media-quality agent and net-new approved media is persisted back to the
 * gallery. Returns the final media context wrapped in the canonical envelope.
 */
async function applyQualityGate(
  mediaContext: string,
  knownGalleryLines: string[],
  competitors: string[],
  category: string,
  subCategory: string,
  queryIntent: MediaQueryIntent,
): Promise<string> {
  const mediaLines = mediaContext.split("\n");
  const galleryLines: string[] = [];
  const nonGalleryLines: string[] = [];
  let inGalleryBlock = false;

  for (const line of mediaLines) {
    if (line.includes("GALLERY MEDIA (pre-verified)")) { inGalleryBlock = true; continue; }
    if (line.includes("END GALLERY MEDIA")) { inGalleryBlock = false; continue; }
    if (line.startsWith("---")) { nonGalleryLines.push(line); continue; }
    if (inGalleryBlock && line.trim()) galleryLines.push(line);
    else if (line.trim()) nonGalleryLines.push(line);
  }

  const finalMediaLines = [...galleryLines];
  const nonGalleryContext = nonGalleryLines.filter((l) => !l.startsWith("---")).join("\n");

  if (nonGalleryContext.trim()) {
    const primaryCompetitor = competitors[0] || "";
    const filteredResult = await filterMediaWithQualityAgent(
      `--- NON-GALLERY MEDIA ---\n${nonGalleryContext}\n--- END ---`,
      primaryCompetitor, category, subCategory,
      { entities: queryIntent?.entities || [] },
    );
    if (filteredResult) {
      const seenFilteredUrls = new Set<string>(
        galleryLines
          .map((l) => {
            const m = l.match(/(https?:\/\/[^\s)]+)/);
            return m ? normalizeUrl(m[1]) : "";
          })
          .filter(Boolean),
      );
      for (const line of filteredResult.split("\n")) {
        const urlMatch = line.match(/(https?:\/\/[^\s)]+)/);
        if (urlMatch) {
          const key = normalizeUrl(urlMatch[1]);
          if (seenFilteredUrls.has(key)) continue;
          seenFilteredUrls.add(key);
        }
        if (line.startsWith("---")) continue;
        if (line.trim()) finalMediaLines.push(line);
      }
    }
  }

  if (finalMediaLines.length > galleryLines.length) {
    persistNewMediaToGallery(
      competitors[0] || "", category, subCategory,
      finalMediaLines.slice(galleryLines.length),
    ).catch((e) => console.error("persistNewMediaToGallery error:", e));
  }

  return finalMediaLines.length > 0
    ? `--- AVAILABLE OFFICIAL MEDIA (AI-verified, score ≥7) ---\n${finalMediaLines.join("\n")}\n--- END MEDIA ---`
    : "";
}

/**
 * On-demand media gather for a single agent-issued query (the
 * `<<NEEDS_MEDIA: ...>>` seam). Runs the same pipeline scoped narrowly to the
 * requested entities so the agent can surface a specific image/video mid-answer.
 */
export async function gatherOnDemandMedia(
  query: string,
  competitors: string[],
  category: string,
  subCategory: string,
): Promise<{ mediaContext: string; items: MediaItemPayload[] }> {
  const entities = query
    .split(/[,;]+|\band\b/i)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2)
    .slice(0, 6);
  const intent: MediaQueryIntent = {
    scope: "narrow",
    entities: entities.length > 0 ? entities : [query.trim()].filter(Boolean),
    asksMedia: true,
  };

  const handle = startMediaGather({ competitors, category, subCategory, queryIntent: intent });
  const full = await handle.runFull([]);
  return { mediaContext: full.mediaContext, items: full.items };
}
