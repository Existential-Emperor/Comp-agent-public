// ───────────────────────────────────────────────────────────────────────────
// STREAMING / FINAL RENDER INVARIANTS — do not break these.
//
// 1. The streaming bubble and the finalized bubble are the SAME React subtree.
//    Both render through FormattedResponse, keyed on a stable client identity
//    (see ChatInterface `clientKey`). The content event must PROMOTE the
//    existing streaming message in place (flip isStreaming, attach the real id),
//    NOT filter-out-and-append a new message. A key swap unmounts/remounts the
//    whole subtree and mounts the entire gallery in one synchronous commit —
//    that is the "tab hang at end of stream" failure class. Never reintroduce a
//    wholesale-replacement pattern at the streaming/final boundary.
//
// 2. NOTE (architecture, not aspiration): media is gathered by an INDEPENDENT
//    pipeline (supabase/functions/_shared/media-pipeline.ts) that runs in
//    parallel with synthesis. Its FAST phase (gallery + YouTube) streams on a
//    dedicated `media` SSE channel DURING research, so the gallery populates
//    EARLY rather than at end-of-stream. The live client renders the gallery
//    from that structured `media` prop (see VisualMediaItem) with PROGRESSIVE/
//    WINDOWED mounting (VisualOverviewSection), so the commit is never large.
//    The live `content` event is PROSE-ONLY and is fully decoupled from media
//    finalization — it must never wait on the slow media phase (that coupling
//    was the "stuck at the end of stream" stall). The SLOW phase (live crawls +
//    quality gate) + any on-demand media are finalized in a BACKGROUND task
//    after stream close, reconstructed into a canonical "## Visual Overview"
//    block, and embedded into the PERSISTED content only — the single source of
//    truth for reload / doc-slide export / judge visual_evidence. On reload (no
//    structured `media`) the gallery is re-derived from that embedded block. The
//    invariant we keep is COMPONENT IDENTITY (stable key, in-place promotion) so
//    React reconciles the prose subtree instead of remounting it.
//
// 3. All content-dependent computations (parsing, block partitioning) MUST be
//    memoized on content identity, not recomputed on every render. During
//    streaming the parser would otherwise re-run on the full accumulated content
//    every frame — O(F·L) cumulative cost that primes the main thread for the
//    end-of-stream stall.
// ───────────────────────────────────────────────────────────────────────────
import React, { useEffect, useMemo, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Play, ExternalLink, Image as ImageIcon, Video } from "lucide-react";
import MediaLightbox, { useLightbox, getYouTubeThumbnail, getHighResImageUrl, type MediaItem } from "@/components/MediaLightbox";
import SmartImage from "@/components/SmartImage";
import { sanitizeImageUrl } from "@/lib/sanitize-image-url";

/** Sanitize + log. Returns null if the URL is unsalvageable. */
function cleanImageUrl(raw: string): string | null {
  const cleaned = sanitizeImageUrl(raw);
  if (cleaned === null) {
    // eslint-disable-next-line no-console
    console.warn("[image-sanitize] dropped", { raw });
    return null;
  }
  if (cleaned !== raw) {
    // eslint-disable-next-line no-console
    console.warn("[image-sanitize] cleaned", { raw, cleaned });
  }
  return cleaned;
}

/**
 * Structured Visual Overview media, delivered on the dedicated `media` SSE
 * channel so the gallery can populate EARLY/in parallel during streaming
 * (decoupled from the prose `content`). Live-only — not persisted; on reload the
 * gallery is re-derived from the canonical "## Visual Overview" embedded in
 * `content`. When present, the gallery renders from these items (progressively),
 * which is what eliminates the synchronous end-of-stream gallery mount (the
 * tab-hang failure class).
 */
export interface VisualMediaItem {
  url: string;
  label: string;
  type: "image" | "video" | "gif";
  pageUrl?: string;
}

interface FormattedResponseProps {
  content: string;
  /** Structured Visual Overview media. When present, the gallery renders from
   *  this (decoupled channel). Absent → legacy path parses media from content. */
  media?: VisualMediaItem[];
}

/** Turn a raw AI response (with markdown-like formatting) into clean, structured JSX */
function FormattedResponseBase({ content, media }: FormattedResponseProps) {
  const lightbox = useLightbox();

  // Parse + partition once per content update (not once per render). During
  // streaming `content` grows every frame; without this memo parseBlocks would
  // re-scan the full accumulated string on every render — O(F·L) cumulative.
  const { imageBlocks, videoBlocks, hasVisualOverview, nonMediaBlocks } = useMemo(() => {
    const blocks = parseBlocks(stripEmptyCitations(content));

    // Extract images and videos for Visual Overview sections
    const imgs = blocks.filter((b): b is Extract<Block, { type: "image" }> => b.type === "image");
    const vids = blocks.filter((b): b is Extract<Block, { type: "video" }> => b.type === "video");
    const hasVO = imgs.length > 1 || vids.length > 0;

    // Filter out media from inline rendering if we have a visual overview
    const nonMedia = hasVO
      ? blocks.filter((b) => b.type !== "image" && b.type !== "video" && !(b.type === "heading" && /^visual\s*overview$/i.test(b.text)))
      : blocks;

    return { imageBlocks: imgs, videoBlocks: vids, hasVisualOverview: hasVO, nonMediaBlocks: nonMedia };
  }, [content]);

  // Structured media (decoupled channel) takes precedence over content-parsed
  // media. Map onto the existing image/video Block shapes so VisualOverviewSection
  // is shared. `media` identity is stable per message (set once per SSE event),
  // so this memo only recomputes when a new media set actually arrives.
  const hasStructuredMedia = !!media && media.length > 0;
  const structuredImages = useMemo(
    () =>
      (media ?? [])
        .filter((m) => m.type !== "video")
        .map((m): Extract<Block, { type: "image" }> => ({ type: "image", alt: m.label, url: m.url, pageUrl: m.pageUrl })),
    [media],
  );
  const structuredVideos = useMemo(
    () =>
      (media ?? [])
        .filter((m) => m.type === "video")
        .map((m): Extract<Block, { type: "video" }> => ({ type: "video", alt: m.label, url: m.url })),
    [media],
  );

  const voImages = hasStructuredMedia ? structuredImages : imageBlocks;
  const voVideos = hasStructuredMedia ? structuredVideos : videoBlocks;
  const showVisualOverview = hasStructuredMedia
    ? structuredImages.length > 0 || structuredVideos.length > 0
    : hasVisualOverview;

  return (
    <div className="space-y-4 text-sm leading-relaxed">
      {showVisualOverview && (
        <VisualOverviewSection images={voImages} videos={voVideos} lightbox={lightbox} />
      )}
      {nonMediaBlocks.map((block, i) => (
        <RenderBlock key={i} block={block} lightbox={lightbox} />
      ))}
      <MediaLightbox
        isOpen={lightbox.state.isOpen}
        onClose={lightbox.close}
        items={lightbox.state.items}
        currentIndex={lightbox.state.currentIndex}
        onNavigate={lightbox.navigate}
      />
    </div>
  );
}

// ── Render-isolation boundary (the root-cause fix for the tab hang) ──────────
// Without this, ANY state change in a parent (a streaming token flush, the
// thinking-step interval, progress updates, feedback toggles, even typing in
// the chat input) re-renders EVERY message bubble, re-executing each one's full
// markdown render path — parseBlocks output → linkify per span + RenderTable's
// O(rows²) dedup. In a multi-message thread that is O(messages) of synchronous
// main-thread work per frame, which saturates the thread and freezes the tab
// (worst at end-of-stream, when the streaming bubble is largest). Memoizing on
// (content, media) lets unchanged bubbles bail out entirely, so only the single
// bubble whose content actually changed re-renders — O(1) per frame. The render
// is a pure function of (content, media), so a default shallow comparison is
// both correct and sufficient: prior bubbles keep a stable `content` string and
// a stable `media` array reference (preserved through the flush map), and a
// bubble re-renders exactly when its own content/media change.
const FormattedResponse = React.memo(FormattedResponseBase);
FormattedResponse.displayName = "FormattedResponse";

// ── Types ──────────────────────────────────────────────
interface ListItem {
  text: string;
  children: ListItem[];
}

type Block =
  | { type: "heading"; level: number; text: string }
  | { type: "table"; headers: string[]; rows: string[][] }
  | { type: "paragraph"; text: string }
  | { type: "list"; items: ListItem[] }
  | { type: "image"; alt: string; url: string; pageUrl?: string }
  | { type: "video"; alt: string; url: string };

// ── Parser ─────────────────────────────────────────────
function parseBlocks(raw: string): Block[] {
  // Pre-process: convert <br/> tags — but preserve table row integrity
  const cleaned = raw.split("\n").map(line => {
    if (line.trim().startsWith("|")) {
      return line.replace(/<br\s*\/?>\s*-\s*/gi, " · ").replace(/<br\s*\/?>/gi, " · ");
    }
    return line.replace(/<br\s*\/?>\s*-/gi, "\n-").replace(/<br\s*\/?>/gi, "\n");
  }).join("\n");
  const lines = cleaned.split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    // Forward-progress anchor. Every branch below either advances `i` (most via
    // `continue`) or falls through to the paragraph handler. The invariant we
    // enforce at the bottom of the loop is that `i` MUST advance on every
    // iteration — see the guard after the paragraph branch.
    const lineStartIndex = i;
    const line = lines[i];

    // Skip empty lines
    if (line.trim() === "") {
      i++;
      continue;
    }

    // Video: [VIDEO: description](url) — standalone on a line
    const videoMatch = line.trim().match(/^\[VIDEO:\s*(.+?)\]\((.+?)\)/);
    if (videoMatch) {
      blocks.push({ type: "video", alt: videoMatch[1], url: videoMatch[2] });
      i++;
      continue;
    }

    // Image: ![alt](url) or ![alt](url "pageUrl") — tolerate legacy rows where
    // the optional title quote was never closed. The older parser would see the
    // line as image-like later, fail to parse it here, and then never advance `i`.
    const imgMatch = line.trim().match(/^!\[(.+?)\]\((\S+?)(?:\s+"([^"]*)"?)?\)/);
    if (imgMatch) {
      const imgUrl = cleanImageUrl(imgMatch[2]);
      const pageUrl = imgMatch[3] || undefined;
      if (imgUrl) {
        const isActualImage = /\.(?:png|jpe?g|gif|webp|svg)(?:\?|$)/i.test(imgUrl) || imgUrl.includes("competitor-screenshots");
        if (isActualImage) {
          blocks.push({ type: "image", alt: imgMatch[1], url: imgUrl, pageUrl });
          const fullMatchLen = imgMatch[0].length;
          const trailing = line.trim().slice(fullMatchLen).replace(/^\s*\|\s*/, "").replace(/\s*\|\s*$/, "").trim();
          if (trailing) {
            blocks.push({ type: "paragraph", text: cleanInline(trailing) });
          }
          i++;
          continue;
        }
      }
      i++;
      continue;
    }

    // Inline images within text
    const inlineImgRegex = /!\[(.+?)\]\((\S+?)(?:\s+"[^"]*"?)?\)/g;
    if (!line.trim().startsWith("|") && inlineImgRegex.test(line.trim())) {
      inlineImgRegex.lastIndex = 0;
      let remaining = line.trim();
      let match;
      while ((match = inlineImgRegex.exec(remaining)) !== null) {
        const inlineUrl = cleanImageUrl(match[2]);
        if (!inlineUrl) continue;
        const isActualImage = /\.(?:png|jpe?g|gif|webp|svg)(?:\?|$)/i.test(inlineUrl) || inlineUrl.includes("competitor-screenshots");
        if (!isActualImage) continue;
        const before = remaining.slice(0, match.index).trim();
        if (before) {
          blocks.push({ type: "paragraph", text: cleanInline(before) });
        }
        blocks.push({ type: "image", alt: match[1], url: inlineUrl });
      }
      const lastMatch = [...remaining.matchAll(/!\[.+?\]\(.+?\)/g)].pop();
      if (lastMatch) {
        const after = remaining.slice(lastMatch.index! + lastMatch[0].length).replace(/^\s*\|\s*/, "").replace(/\s*\|\s*$/, "").trim();
        if (after) {
          blocks.push({ type: "paragraph", text: cleanInline(after) });
        }
      }
      i++;
      continue;
    }

    // Heading: lines starting with # (1-4 levels)
    const headingMatch = line.match(/^(#{1,4})\s+(.+)/);
    if (headingMatch) {
      blocks.push({
        type: "heading",
        level: headingMatch[1].length,
        text: cleanInline(headingMatch[2]),
      });
      i++;
      continue;
    }

    // Table: detect rows starting with |
    if (line.trim().startsWith("|")) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        tableLines.push(lines[i]);
        i++;
      }
      const parsed = parseTable(tableLines);
      if (parsed) {
        blocks.push(parsed);
      }
      continue;
    }

    // List items: lines starting with - or * or numbered (with nesting support)
    if (/^\s*[-*•]\s+/.test(line) || /^\s*\d+[.)]\s+/.test(line)) {
      const listItems = parseNestedList(lines, i);
      i = listItems.endIndex;

      // Check for header-like items
      const finalItems: ListItem[] = [];
      for (const item of listItems.items) {
        if (isHeaderLikeItem(item.text) && item.children.length === 0) {
          if (finalItems.length > 0) {
            blocks.push({ type: "list", items: [...finalItems] });
            finalItems.length = 0;
          }
          blocks.push({ type: "heading", level: 3, text: item.text });
        } else {
          // Check for video/image items
          const videoItemMatch = item.text.match(/^\[VIDEO:\s*(.+?)\]\((.+?)\)$/i);
          const imageItemMatch = item.text.match(/^!\[(.+?)\]\((\S+?)(?:\s+"[^"]*")?\)$/);
          if (videoItemMatch || imageItemMatch) {
            if (finalItems.length > 0) {
              blocks.push({ type: "list", items: [...finalItems] });
              finalItems.length = 0;
            }
            if (videoItemMatch) {
              blocks.push({ type: "video", alt: videoItemMatch[1], url: videoItemMatch[2] });
            } else if (imageItemMatch) {
              const cleanedItemUrl = cleanImageUrl(imageItemMatch[2]);
              if (cleanedItemUrl) {
                blocks.push({ type: "image", alt: imageItemMatch[1], url: cleanedItemUrl });
              }
            }
          } else {
            finalItems.push(item);
          }
        }
      }
      if (finalItems.length > 0) {
        blocks.push({ type: "list", items: finalItems });
      }
      continue;
    }

    // Otherwise: paragraph
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !lines[i].match(/^#{1,4}\s+/) &&
      !lines[i].trim().startsWith("|") &&
      !/^\s*[-*•]\s+/.test(lines[i]) &&
      !/^\s*\d+[.)]\s+/.test(lines[i]) &&
      !lines[i].trim().match(/^!\[.+?\]\(.+?\)/) &&
      !lines[i].trim().match(/^\[VIDEO:\s*.+?\]\(.+?\)/)
    ) {
      if (/!\[.+?\]\(.+?\)/.test(lines[i])) break;
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length > 0) {
      blocks.push({ type: "paragraph", text: cleanInline(paraLines.join(" ")) });
    } else if (line.trim().startsWith("![")) {
      // Safety valve: malformed markdown image that did not match above must not
      // trap the parser on the same line forever.
      i++;
    }

    // GUARANTEED FORWARD PROGRESS (root-cause fix for the tab hang).
    // If no rule consumed this line and the paragraph collector took nothing,
    // `i` is still where it started — the tokenizer would spin on this line
    // forever and hard-freeze the tab. The known trigger: a line with a
    // MID-LINE inline image whose URL contains a literal space (e.g. a crawled
    // screenshot filename ".../Vena Report.png"). The dispatch regex uses a
    // no-space URL (\S+?) so it does NOT classify the line as an image, but the
    // paragraph `break` uses a permissive URL (.+?) that DOES match, so the
    // collector breaks on iteration one with paraLines empty. Rather than chase
    // every such regex mismatch, we make the loop unstallable: emit the line as
    // prose and advance, so NO input shape can ever wedge the parser.
    if (i === lineStartIndex) {
      const text = cleanInline(line);
      if (text) blocks.push({ type: "paragraph", text });
      i++;
    }
  }

  // Post-process: filter image URLs from Reference Links section
  return filterImageUrlsFromReferenceLinks(blocks);
}

/** Filter out media URLs (images, screenshots, videos) from Sources / Reference Links sections */
function filterImageUrlsFromReferenceLinks(blocks: Block[]): Block[] {
  let inRefLinks = false;
  return blocks.map(block => {
    if (block.type === "heading" && /^(?:reference\s*links?|sources?)$/i.test(block.text.trim())) {
      inRefLinks = true;
      return block;
    }
    if (block.type === "heading" && inRefLinks) {
      inRefLinks = false; // next section
    }
    if (!inRefLinks) return block;

    // In Sources / Reference Links section: filter list items that are media URLs
    if (block.type === "list") {
      const filtered = block.items.filter(item => {
        const text = item.text;
        if (isVisualOverviewUrl(text)) return false;
        const mdLinkMatch = text.match(/^\[([^\]]*)\]\(([^)]+)\)$/);
        if (mdLinkMatch && isVisualOverviewUrl(mdLinkMatch[2])) return false;
        // Drop empty-href entries that survived (defense in depth)
        const emptyHref = text.match(/^\[([^\]]*)\]\(\s*\)$/);
        if (emptyHref) return false;
        return true;
      });
      if (filtered.length === 0) return null;
      return { ...block, items: filtered };
    }
    if (block.type === "paragraph") {
      if (isVisualOverviewUrl(block.text)) return null;
      const mdLinkMatch = block.text.match(/^\[([^\]]*)\]\(([^)]+)\)$/);
      if (mdLinkMatch && isVisualOverviewUrl(mdLinkMatch[2])) return null;
      const emptyHref = block.text.match(/^\[[^\]]*\]\(\s*\)\s*$/);
      if (emptyHref) return null;
    }
    return block;
  }).filter((b): b is Block => b !== null);
}

function isVisualOverviewUrl(text: string): boolean {
  const urlMatch = text.match(/(https?:\/\/[^\s)]+)/);
  if (!urlMatch) return false;
  const url = urlMatch[1].toLowerCase();
  if (/\.(?:png|jpe?g|gif|webp|svg|mp4|webm|mov|ogg)(?:\?|$)/i.test(url)) return true;
  if (url.includes("competitor-screenshots")) return true;
  if (url.includes("/storage/v1/object/public/")) return true;
  if (url.includes("youtube.com/watch") || url.includes("youtu.be/")) return true;
  if (url.includes("vimeo.com/") || url.includes("wistia.com/")) return true;
  if (url.includes("vidyard.com/") || url.includes("loom.com/")) return true;
  return false;
}

/** Parse nested list items preserving indentation hierarchy */
function parseNestedList(lines: string[], startIndex: number): { items: ListItem[]; endIndex: number } {
  const items: ListItem[] = [];
  let i = startIndex;

  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "") { i++; break; }

    const bulletMatch = line.match(/^(\s*)([-*•])\s+(.+)/);
    const numMatch = line.match(/^(\s*)(\d+[.)])\s+(.+)/);

    if (!bulletMatch && !numMatch) break;

    const indent = (bulletMatch || numMatch)![1].length;
    const rawText = (bulletMatch ? bulletMatch[3] : numMatch![3]).trim();
    if (!rawText) { i++; continue; }
    const text = cleanInline(rawText);

    if (indent === 0) {
      // Top-level item
      const item: ListItem = { text, children: [] };
      i++;

      // Collect children (indented items)
      while (i < lines.length) {
        const childLine = lines[i];
        if (childLine.trim() === "") { i++; break; }
        const childBullet = childLine.match(/^(\s+)([-*•])\s+(.+)/);
        const childNum = childLine.match(/^(\s+)(\d+[.)])\s+(.+)/);
        if (!childBullet && !childNum) break;
        const childIndent = (childBullet || childNum)![1].length;
        if (childIndent <= 0) break; // back to top level
        const childText = cleanInline((childBullet ? childBullet[3] : childNum![3]).trim());
        if (childText) {
          item.children.push({ text: childText, children: [] });
        }
        i++;
      }
      items.push(item);
    } else {
      // Indented but no parent collected yet — treat as top-level
      items.push({ text, children: [] });
      i++;
    }
  }

  return { items, endIndex: i };
}

function parseTable(lines: string[]): Block | null {
  const dataLines = lines.filter((l) => {
    const cells = l.split("|").slice(1, -1);
    if (cells.length === 0) return true;
    const isSeparator = cells.every((c) => /^[\s\-:]+$/.test(c));
    return !isSeparator;
  });
  if (dataLines.length < 1) return null;

  const parseCells = (line: string) =>
    line
      .split("|")
      .slice(1, -1)
      .map((c) => cleanInline(c.trim()));

  const headers = parseCells(dataLines[0]);
  const rows = dataLines.slice(1).map((row) => {
    const cells = parseCells(row);
    if (cells.length < headers.length) {
      return [...cells, ...Array(headers.length - cells.length).fill("")];
    }
    return cells.slice(0, headers.length);
  });

  if (headers.length === 0) return null;
  return { type: "table", headers, rows };
}

/** Detect list items that are actually headers/sub-headers */
function isHeaderLikeItem(text: string): boolean {
  // Only treat em-dash lines as headers if they're short standalone labels
  // (e.g. "Strengths — Overview") NOT descriptive items with URLs or long text
  if (/\s[—–]\s/.test(text)) {
    const hasUrl = /https?:\/\//.test(text) || /\[.*\]\(.*\)/.test(text);
    const isShortLabel = text.length < 60;
    if (!hasUrl && isShortLabel) return true;
  }
  const SECTION_LABELS = [
    "strengths vs weaknesses", "strengths vs. weaknesses", "key differences",
    "strengths", "weaknesses", "potential limitations", "potential gaps",
    "unknowns/potential gaps", "summary", "overview", "conclusion",
    "what you can schedule", "frequency and timing", "pricing",
    "integration capabilities", "data integration", "reporting capabilities",
  ];
  if (SECTION_LABELS.includes(text.toLowerCase().replace(/[()]/g, "").trim())) return true;
  return false;
}

/**
 * Pre-parser sanitizer: removes any markdown link with an empty/whitespace href
 * (e.g. `[Source]()`, `[Source]( )`, `[]()`) BEFORE blocks are parsed.
 *
 * - Inside `## Sources` / `## Reference Links` sections, full lines that are
 *   only empty-href tokens (with optional bullets, separators, whitespace) are
 *   dropped. Mixed lines have only the empty tokens removed.
 * - Outside source sections, the empty token is removed entirely. We do NOT
 *   keep the label as plain text — `Source` with no URL is just visual noise.
 * - If a Sources section becomes empty after cleanup, the heading is dropped.
 */
function stripEmptyCitations(input: string): string {
  if (!/\[[^\]]*\]\(\s*\)/.test(input)) return input;
  const EMPTY_TOKEN = /\[[^\]]*\]\(\s*\)/g;
  const lines = input.split("\n");
  const out: string[] = [];
  let inSourcesBlock = false;

  for (const raw of lines) {
    if (/^##\s+(Sources?|Reference\s*Links?)\b/i.test(raw)) {
      inSourcesBlock = true;
      out.push(raw);
      continue;
    }
    if (inSourcesBlock && /^##\s+/.test(raw)) {
      inSourcesBlock = false;
    }

    if (!EMPTY_TOKEN.test(raw)) {
      out.push(raw);
      continue;
    }
    EMPTY_TOKEN.lastIndex = 0;

    const stripped = raw.replace(EMPTY_TOKEN, "");
    const residue = stripped.replace(/^[\s\-*•]+/, "").replace(/[\s,;|]+$/, "").trim();

    if (residue.length === 0) {
      // Drop entirely — line was only empty citations.
      continue;
    }
    // Mixed line: keep only the cleaned remainder (collapse double spaces).
    out.push(stripped.replace(/[ \t]{2,}/g, " ").replace(/\s+([.,;:!?])/g, "$1").trimEnd());
  }

  let cleaned = out.join("\n").replace(/\n{3,}/g, "\n\n");
  // Drop empty Sources / Reference Links sections.
  cleaned = cleaned.replace(
    /(^|\n)##\s+(?:Sources?|Reference\s*Links?)\s*(?=\n##\s|\n*$)/gi,
    "$1",
  );
  return cleaned;
}

/** Remove markdown bold/italic markers, HTML tags, and clean up stray symbols */
function cleanInline(text: string): string {
  // Defense in depth: drop any empty-href markdown link tokens that survived
  // the pre-parser sanitizer (e.g. legacy table cells). We DELETE them rather
  // than convert to plain-text labels — `[Source]()` becoming `Source` is the
  // exact symptom we are trying to eliminate.
  text = text.replace(/\[[^\]]*\]\(\s*\)/g, "");

  // Strip inline roadmap citation markers ([roadmap: source]) from user-visible
  // output, mirroring [Source: …] marker stripping. The marker is the structural
  // signal the contract enforces; the user only sees the "(roadmap)" badge.
  text = text.replace(/\[roadmap:[^\]]*\]/gi, "");

  // AGENT/MEDIA SEPARATION (root-cause fix for the "freezes while fetching
  // images" hang). The prose channel must render ZERO media. Media is owned
  // exclusively by the gallery (the structured `media` SSE channel live, and
  // the reconstructed "## Visual Overview" standalone blocks on reload). But
  // the live token stream is raw model output, and the model still emits inline
  // image markdown into prose despite the prompt forbidding it. Standalone
  // images are lifted into blocks by parseBlocks; INLINE images embedded in a
  // sentence (often with spaced Supabase URLs that the strict block regex
  // can't classify) otherwise survive into paragraph text and get rendered by
  // `linkify` as EAGER <img> elements — dozens of them, with broken URLs and no
  // intrinsic width, re-evaluated on every streaming frame. That is the
  // layout/decode storm that saturates the main thread during image fetching.
  // Strip inline image / video markdown here so prose stays strictly prose.
  text = text.replace(/!\[[^\]]*\]\([^)]*\)/g, "");
  text = text.replace(/\[VIDEO:\s*[^\]]*\]\([^)]*\)/gi, "");

  const linkPlaceholders: string[] = [];
  let protected_ = text.replace(/\[([^\]]*)\]\(([^)]+)\)/g, (match) => {
    linkPlaceholders.push(match);
    return `___LINK_${linkPlaceholders.length - 1}___`;
  });

  protected_ = protected_
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\*\*\*(.+?)\*\*\*/g, "$1")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/`(.+?)`/g, "$1")
    .replace(/^#+\s*/, "")
    .replace(/\s*\|\s*$/g, "")
    .replace(/^\s*\|\s*/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([.,;:!?])/g, "$1")
    .trim();

  protected_ = protected_.replace(/___LINK_(\d+)___/g, (_, idx) => linkPlaceholders[parseInt(idx)]);
  return protected_;
}

/** Detect URLs, inline images ![alt](url), and markdown links [text](url) and render them */
function linkify(text: string): React.ReactNode[] {
  const inlineImgRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
  if (inlineImgRegex.test(text)) {
    inlineImgRegex.lastIndex = 0;
    const nodes: React.ReactNode[] = [];
    let lastIndex = 0;
    let match;
    while ((match = inlineImgRegex.exec(text)) !== null) {
      const imgUrl = match[2];
      const isActualImage = /\.(?:png|jpe?g|gif|webp|svg)(?:\?|$)/i.test(imgUrl) || imgUrl.includes("competitor-screenshots");
      if (!isActualImage) continue;
      if (match.index > lastIndex) {
        nodes.push(...linkifyUrls(text.slice(lastIndex, match.index), nodes.length));
      }
      nodes.push(
        <SmartImage
          key={`img-${nodes.length}`}
          src={imgUrl}
          alt={match[1]}
          className="inline-block max-h-48 rounded-md border border-border my-1"
          height={192}
          aspectRatio="16/9"
          eager
        />
      );
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < text.length) {
      nodes.push(...linkifyUrls(text.slice(lastIndex), nodes.length));
    }
    return nodes;
  }

  return linkifyUrls(text, 0);
}

// Renders a literal "(roadmap)" suffix as a subtle badge so users can spot
// future/unreleased capability at a glance (analyst tags these per the contract).
function renderRoadmapMarkers(text: string, keyBase: number | string): React.ReactNode {
  if (!/\(roadmap\)/i.test(text)) return text;
  const parts = text.split(/(\(roadmap\))/gi);
  return parts.map((part, i) =>
    /^\(roadmap\)$/i.test(part) ? (
      <span
        key={`rm-${keyBase}-${i}`}
        className="mx-0.5 inline-flex items-center rounded-sm border border-accent/40 bg-accent/10 px-1 text-[0.7em] font-semibold uppercase tracking-wide text-accent align-baseline"
        title="Future / not-yet-released capability"
      >
        roadmap
      </span>
    ) : (
      <span key={`rmt-${keyBase}-${i}`}>{part}</span>
    ),
  );
}

function linkifyUrls(text: string, keyOffset: number): React.ReactNode[] {
  const tokenRegex = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|(https?:\/\/[^\s,)\]>]+)/g;
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(text)) !== null) {
    const [fullMatch, mdLabel, mdUrl, plainUrl] = match;

    if (match.index > lastIndex) {
      nodes.push(<span key={keyOffset + nodes.length}>{renderRoadmapMarkers(text.slice(lastIndex, match.index), keyOffset + nodes.length)}</span>);
    }

    if (mdLabel && mdUrl) {
      nodes.push(
        <a
          key={keyOffset + nodes.length}
          href={mdUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline underline-offset-2 hover:text-primary/80 break-all"
        >
          {mdLabel}
        </a>
      );
    } else if (plainUrl) {
      const displayUrl = plainUrl.length > 80 ? plainUrl.slice(0, 77) + "..." : plainUrl;
      nodes.push(
        <a
          key={keyOffset + nodes.length}
          href={plainUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline underline-offset-2 hover:text-primary/80 break-all"
        >
          {displayUrl}
        </a>
      );
    }

    lastIndex = match.index + fullMatch.length;
  }

  if (lastIndex < text.length) {
    nodes.push(<span key={keyOffset + nodes.length}>{renderRoadmapMarkers(text.slice(lastIndex), keyOffset + nodes.length)}</span>);
  }

  return nodes.length > 0 ? nodes : [<span key={keyOffset}>{renderRoadmapMarkers(text, keyOffset)}</span>];
}

// ── Renderers ──────────────────────────────────────────
type LightboxControls = ReturnType<typeof useLightbox>;

function RenderBlock({ block, lightbox }: { block: Block; lightbox: LightboxControls }) {
  switch (block.type) {
    case "heading":
      return <RenderHeading level={block.level} text={block.text} />;
    case "table":
      return <RenderTable headers={block.headers} rows={block.rows} />;
    case "list":
      return <RenderList items={block.items} />;
    case "paragraph":
      return <p className="text-foreground/90">{linkify(block.text)}</p>;
    case "image":
      return <RenderImage alt={block.alt} url={block.url} pageUrl={block.pageUrl} lightbox={lightbox} />;
    case "video":
      return <RenderVideo alt={block.alt} url={block.url} lightbox={lightbox} />;
  }
}

function RenderHeading({ level, text }: { level: number; text: string }) {
  const classes: Record<number, string> = {
    1: "text-lg font-bold text-foreground border-b border-border pb-1",
    2: "text-base font-semibold text-foreground border-b border-border/50 pb-1",
    3: "text-sm font-semibold text-foreground",
    4: "text-sm font-medium text-muted-foreground",
  };
  return <div className={classes[level] || classes[3]}>{linkify(text)}</div>;
}

function RenderTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  const filteredRows = rows.filter((row) => {
    const nonEmpty = row.filter((c) => c.trim() !== "");
    if (nonEmpty.length === 0) return false;
    if (nonEmpty.length === 1 && headers.length > 1) return false;
    return true;
  });

  const validRows: string[][] = [];
  for (const row of filteredRows) {
    const label = row[0]?.trim();
    const existingIdx = validRows.findIndex((r) => r[0]?.trim() === label && label !== "");
    if (existingIdx !== -1) {
      const existing = validRows[existingIdx];
      const emptyColsInExisting: number[] = [];
      for (let c = 1; c < existing.length; c++) {
        if (!existing[c] || existing[c].trim() === "") emptyColsInExisting.push(c);
      }
      const filledColsInNew: number[] = [];
      for (let c = 1; c < row.length; c++) {
        if (row[c]?.trim()) filledColsInNew.push(c);
      }
      const allInSameCols = filledColsInNew.every(c => existing[c]?.trim());
      if (allInSameCols && emptyColsInExisting.length > 0) {
        let emptyIdx = 0;
        for (const c of filledColsInNew) {
          if (emptyIdx < emptyColsInExisting.length) {
            existing[emptyColsInExisting[emptyIdx]] = row[c];
            emptyIdx++;
          }
        }
      } else {
        for (let c = 1; c < row.length; c++) {
          if ((!existing[c] || existing[c].trim() === "") && row[c]?.trim()) {
            existing[c] = row[c];
          } else if (existing[c]?.trim() && row[c]?.trim()) {
            existing[c] = existing[c] + " · " + row[c];
          }
        }
      }
    } else {
      validRows.push([...row]);
    }
  }

  if (validRows.length === 0) return null;

  return (
    <div className="rounded-md border border-border overflow-hidden">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              {headers.map((h, i) => (
                <TableHead key={i} className="text-xs font-semibold text-foreground min-w-[120px]">
                  {h}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {validRows.map((row, ri) => (
              <TableRow key={ri}>
                {row.map((cell, ci) => {
                  const stripped = cell.replace(/^\s*-\s+/, "");
                  const parts = stripped
                    .split(/\s·\s|(?:\n)\s*-\s+/)
                    .map(p => p.trim())
                    .filter(Boolean);
                  const isBulletList = parts.length > 1;
                  const isLabelCol = ci === 0 && headers.length > 2;

                  return (
                    <TableCell
                      key={ci}
                      className={`text-xs py-2 break-words align-top ${isLabelCol ? "font-medium text-foreground" : "text-foreground/80"}`}
                    >
                      {isBulletList ? (
                        <ul className="list-disc list-inside space-y-1 pl-0">
                          {parts.map((part, pi) => (
                            <li key={pi} className="leading-snug">{linkify(part)}</li>
                          ))}
                        </ul>
                      ) : (
                        linkify(parts[0] || cell)
                      )}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function RenderList({ items }: { items: ListItem[] }) {
  return (
    <ul className="space-y-1 pl-4">
      {items.map((item, i) => (
        <li key={i} className="text-foreground/90">
          <div className="flex items-start gap-2">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60" />
            <span>{linkify(item.text)}</span>
          </div>
          {item.children.length > 0 && (
            <ul className="space-y-1 pl-6 mt-1">
              {item.children.map((child, ci) => (
                <li key={ci} className="text-foreground/80 flex items-start gap-2">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/40" />
                  <span className="text-xs">{linkify(child.text)}</span>
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}

function RenderImage({ alt, url, pageUrl, lightbox }: { alt: string; url: string; pageUrl?: string; lightbox: LightboxControls }) {
  const [hasError, setHasError] = React.useState(false);
  const highResUrl = getHighResImageUrl(url);

  if (hasError) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 text-xs text-primary underline underline-offset-2 hover:text-primary/80"
      >
        <ExternalLink className="h-3 w-3" />
        {alt}
      </a>
    );
  }

  return (
    <div className="my-2">
      <button
        onClick={() => lightbox.openImage(highResUrl, alt, pageUrl)}
        className="group relative cursor-pointer rounded-lg overflow-hidden border border-border hover:border-primary/50 transition-colors max-w-md"
      >
        <SmartImage
          src={url}
          alt={alt}
          className="max-h-64 w-auto object-contain rounded-lg"
          height={256}
          aspectRatio="16/9"
          onTerminalFailure={() => setHasError(true)}
        />
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
          <span className="opacity-0 group-hover:opacity-100 transition-opacity text-white text-xs bg-black/60 px-2 py-1 rounded">
            Click to enlarge
          </span>
        </div>
      </button>
      <p className="text-xs text-muted-foreground mt-1">{alt}</p>
    </div>
  );
}

function RenderVideo({ alt, url, lightbox }: { alt: string; url: string; lightbox: LightboxControls }) {
  const thumbnail = getYouTubeThumbnail(url);
  const [thumbFailed, setThumbFailed] = React.useState(false);

  return (
    <div className="my-2 max-w-md">
      <button
        onClick={() => lightbox.openVideo(url, alt)}
        className="group relative w-full cursor-pointer rounded-lg overflow-hidden border border-border hover:border-primary/50 transition-colors"
      >
        {thumbnail && !thumbFailed ? (
          <img
            src={thumbnail}
            alt={alt}
            className="w-full aspect-video object-cover rounded-lg"
            loading="lazy"
            onError={() => setThumbFailed(true)}
          />
        ) : (
          <div className="w-full aspect-video bg-muted flex items-center justify-center rounded-lg px-4 text-center">
            <span className="text-xs text-muted-foreground">{alt || "Video preview unavailable"}</span>
          </div>
        )}

        <div className="absolute inset-0 flex items-center justify-center">
          <div className="h-14 w-14 rounded-full bg-black/70 group-hover:bg-primary/90 flex items-center justify-center transition-colors shadow-lg">
            <Play className="h-7 w-7 text-white fill-white ml-0.5" />
          </div>
        </div>
      </button>
      <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2">
        <Play className="h-3 w-3" />
        <span className="truncate">{alt}</span>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto text-primary underline underline-offset-2 hover:text-primary/80"
        >
          Open
        </a>
      </div>
    </div>
  );
}

// ── Visual Overview: Gallery Grid + YouTube Videos ──────
// Memoized: during token streaming FormattedResponse re-renders on every flush,
// but the media set + (now-stable) lightbox are unchanged, so the gallery
// subtree is skipped entirely. It only re-renders when media actually changes.
const VisualOverviewSection = React.memo(function VisualOverviewSection({
  images,
  videos,
  lightbox,
}: {
  images: Extract<Block, { type: "image" }>[];
  videos: Extract<Block, { type: "video" }>[];
  lightbox: LightboxControls;
}) {
  // Build all image items for lightbox navigation (always the FULL set, so
  // navigation works even while thumbnails are still mounting progressively).
  const allImageItems: MediaItem[] = images.map(img => ({
    type: "image" as const,
    src: getHighResImageUrl(img.url),
    alt: img.alt,
    pageUrl: img.pageUrl,
  }));

  // ── Progressive (windowed) mount ────────────────────────────────────────
  // The Visual Overview can arrive in a single update (full media event, or a
  // content-parse on reload). Mounting every GalleryThumb — each a SmartImage with
  // its own effects + IntersectionObserver — in one synchronous React commit is
  // exactly the end-of-stream main-thread stall we are fixing. Spread the mount
  // across animation frames in small batches so no single commit is large.
  const MOUNT_BATCH = 8;
  const [mountCount, setMountCount] = useState(() => Math.min(MOUNT_BATCH, images.length));

  // Reset the baseline whenever the image set changes (fast→full, reload).
  useEffect(() => {
    setMountCount(Math.min(MOUNT_BATCH, images.length));
  }, [images.length]);

  // Grow the mounted window one batch per frame until everything is mounted.
  useEffect(() => {
    if (mountCount >= images.length) return;
    const raf = requestAnimationFrame(() => {
      setMountCount((c) => Math.min(c + MOUNT_BATCH, images.length));
    });
    return () => cancelAnimationFrame(raf);
  }, [mountCount, images.length]);

  const visibleImages = images.slice(0, mountCount);

  return (
    <div className="mb-4 space-y-4">
      <h2 className="font-semibold text-foreground mt-1 mb-3 text-base">Visual Overview</h2>

      {/* Media Gallery — Horizontal Scroll */}
      {images.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <ImageIcon className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">
              Media ({images.length} screenshot{images.length !== 1 ? "s" : ""})
            </span>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
            {visibleImages.map((img, i) => (
              <GalleryThumb
                key={`${img.url}-${i}`}
                img={img}
                index={i}
                allImageItems={allImageItems}
                lightbox={lightbox}
                eager={i < 6}
              />
            ))}
            {mountCount < images.length && (
              <div
                className="flex shrink-0 w-44 h-28 items-center justify-center rounded-lg border border-border bg-muted/20 text-xs text-muted-foreground"
                aria-hidden="true"
              >
                Loading {images.length - mountCount} more…
              </div>
            )}
          </div>
        </div>
      )}

      {/* YouTube Videos Section */}
      {videos.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Video className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">
              YouTube Videos ({videos.length})
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {videos.map((vid, i) => (
              <VideoCard key={i} alt={vid.alt} url={vid.url} lightbox={lightbox} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
});

function GalleryThumb({
  img,
  index,
  allImageItems,
  lightbox,
  eager = false,
}: {
  img: Extract<Block, { type: "image" }>;
  index: number;
  allImageItems: MediaItem[];
  lightbox: LightboxControls;
  eager?: boolean;
}) {
  return (
    <button
      onClick={() => lightbox.openImage(getHighResImageUrl(img.url), img.alt, img.pageUrl, allImageItems, index)}
      className="group relative shrink-0 w-44 rounded-lg overflow-hidden border border-border hover:border-primary/50 transition-colors cursor-pointer bg-muted/20"
    >
      <SmartImage
        src={img.url}
        alt={img.alt}
        className="w-44 h-28 object-contain"
        width={176}
        height={112}
        eager={eager}
      />
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
      <p className="text-[10px] text-muted-foreground truncate px-1.5 py-1 bg-background/80">
        {img.alt}
      </p>
    </button>
  );
}

function VideoCard({ alt, url, lightbox }: { alt: string; url: string; lightbox: LightboxControls }) {
  const thumbnail = getYouTubeThumbnail(url);
  const [thumbFailed, setThumbFailed] = React.useState(false);

  return (
    <div>
      <button
        onClick={() => lightbox.openVideo(url, alt)}
        className="group relative w-full cursor-pointer rounded-lg overflow-hidden border border-border hover:border-primary/50 transition-colors"
      >
        {thumbnail && !thumbFailed ? (
          <img
            src={thumbnail}
            alt={alt}
            className="w-full aspect-video object-cover"
            loading="lazy"
            onError={() => setThumbFailed(true)}
          />
        ) : (
          <div className="w-full aspect-video bg-muted flex items-center justify-center px-4 text-center">
            <span className="text-xs text-muted-foreground">{alt || "Video"}</span>
          </div>
        )}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="h-10 w-10 rounded-full bg-black/70 group-hover:bg-primary/90 flex items-center justify-center transition-colors shadow-lg">
            <Play className="h-5 w-5 text-white fill-white ml-0.5" />
          </div>
        </div>
      </button>
      <div className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1 px-1">
        <Play className="h-2.5 w-2.5 shrink-0" />
        <span className="truncate">{alt}</span>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto shrink-0 text-primary underline underline-offset-2 hover:text-primary/80"
        >
          Open
        </a>
      </div>
    </div>
  );
}

export default FormattedResponse;
