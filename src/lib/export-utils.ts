import { saveAs } from "file-saver";
import PptxGenJS from "pptxgenjs";
import { supabase } from "@/integrations/supabase/client";

interface SlideSummaryOptions {
  messageId?: string;
  traceId?: string;
  traceMetadata?: any;
}

interface SlideSectionSummaryEntry {
  heading: string;
  bullets: string[];
  summaries: string[];
}

interface StoredSlideSummaryMetadata {
  sections: SlideSectionSummaryEntry[];
  lookup: Record<string, string>;
}

/**
 * Convert a markdown-ish AI response into a styled HTML document and download as .doc
 */
export function downloadAsDoc(content: string, filename = "competitive-analysis") {
  // Convert markdown to basic HTML
  let html = content
    // Headers
    .replace(/^#### (.+)$/gm, "<h4>$1</h4>")
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    // Bold and italic
    .replace(/\*\*\*(.+?)\*\*\*/g, "<b><i>$1</i></b>")
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(/\*(.+?)\*/g, "<i>$1</i>")
    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    // Images (skip in doc)
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "[$1]")
    // Tables
    .replace(/^\|(.+)\|$/gm, (match) => {
      const cells = match.split("|").filter(c => c.trim());
      if (cells.every(c => /^[\s\-:]+$/.test(c))) return ""; // separator row
      const cellHtml = cells.map(c => `<td style="border:1px solid #ccc;padding:6px 10px;">${c.trim()}</td>`).join("");
      return `<tr>${cellHtml}</tr>`;
    })
    // List items
    .replace(/^\s*[-*•]\s+(.+)$/gm, "<li>$1</li>")
    .replace(/^\s*\d+[.)]\s+(.+)$/gm, "<li>$1</li>")
    // Paragraphs (double newline)
    .replace(/\n\n/g, "</p><p>")
    // Single newlines within paragraphs
    .replace(/\n/g, "<br/>");

  // Wrap consecutive <li> in <ul>
  html = html.replace(/(<li>.*?<\/li>(?:\s*<br\/?>)*)+/gs, (match) => {
    return `<ul>${match.replace(/<br\/?>/g, "")}</ul>`;
  });

  // Wrap consecutive <tr> in <table>
  html = html.replace(/(<tr>.*?<\/tr>\s*)+/gs, (match) => {
    return `<table style="border-collapse:collapse;width:100%;margin:12px 0;">${match}</table>`;
  });

  const styledHtml = `
    <html xmlns:o='urn:schemas-microsoft-com:office:office' 
          xmlns:w='urn:schemas-microsoft-com:office:word'
          xmlns='http://www.w3.org/TR/REC-html40'>
    <head><meta charset="utf-8">
    <style>
      body { font-family: Calibri, Arial, sans-serif; font-size: 11pt; color: #222; line-height: 1.6; max-width: 800px; margin: 0 auto; padding: 40px; }
      h1 { font-size: 20pt; color: #1a1a2e; border-bottom: 2px solid #1a1a2e; padding-bottom: 6px; }
      h2 { font-size: 16pt; color: #16213e; border-bottom: 1px solid #ddd; padding-bottom: 4px; margin-top: 20px; }
      h3 { font-size: 13pt; color: #0f3460; margin-top: 16px; }
      h4 { font-size: 11pt; color: #555; }
      table { border-collapse: collapse; width: 100%; margin: 12px 0; }
      td, th { border: 1px solid #ccc; padding: 6px 10px; vertical-align: top; font-size: 10pt; }
      tr:first-child td { background: #f0f0f5; font-weight: bold; }
      ul { margin: 8px 0; padding-left: 24px; }
      li { margin: 4px 0; }
      a { color: #0f3460; }
      p { margin: 8px 0; }
    </style></head>
    <body><p>${html}</p></body></html>
  `;

  const blob = new Blob([styledHtml], { type: "application/msword;charset=utf-8" });
  saveAs(blob, `${filename}.doc`);
}

/**
 * Extract competitor names from a single response context only.
 * Strictly avoids heading-based parsing to prevent cross-response leakage.
 */
const COMPETITOR_STOPWORDS = new Set([
  "workday",
  "workday adaptive planning",
  "competitive analysis",
  "analysis",
  "executive summary",
  "visual overview",
  "key themes",
  "key findings",
  "strengths",
  "weaknesses",
  "opportunities",
  "threats",
  "reporting & analytics comparison",
  "modeling & architecture comparison",
  "intelligent planning & ai comparison",
  "integration & data connectivity",
  "collaboration & workflow",
  "specialized planning modules",
  "overall strengths vs weaknesses",
  "reference links",
]);

function normalizeCompetitorName(raw: string): string | null {
  const cleaned = raw
    .replace(/["'`“”]/g, "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\b(in the context of|context of|full product|for fp&a|for fpa)\b.*$/i, "")
    .replace(/^[,;:\-–—\s]+|[,;:\-–—\s]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return null;
  const lower = cleaned.toLowerCase();
  if (COMPETITOR_STOPWORDS.has(lower)) return null;
  if (cleaned.length < 2 || cleaned.length > 60) return null;
  if (!/[a-z]/i.test(cleaned)) return null;
  if (cleaned.split(/\s+/).length > 7) return null;

  return cleaned;
}

function splitCompetitorChunk(chunk: string): string[] {
  return chunk
    .split(/\s*(?:,|\/|&|\band\b|\bvs\.?\b|\bversus\b)\s*/i)
    .map((part) => normalizeCompetitorName(part))
    .filter((name): name is string => Boolean(name));
}

function extractCompetitorNames(content: string, metadata?: any): string[] {
  const fromMetadata = Array.isArray(metadata?.competitors)
    ? metadata.competitors
        .map((value: unknown) => normalizeCompetitorName(String(value)))
        .filter((name): name is string => Boolean(name))
    : [];

  if (fromMetadata.length > 0) {
    return Array.from(new Set(fromMetadata));
  }

  const normalizedContent = content.replace(/\s+/g, " ").trim();
  const names = new Set<string>();
  const patterns = [
    /(?:analysis(?:\s+comparing|\s+of)?|compare|comparing)\s+([^.?!]{3,180}?)\s+(?:against|vs\.?|versus)\s+workday adaptive planning/gi,
    /workday adaptive planning\s+(?:against|vs\.?|versus)\s+([^.?!]{3,180})/gi,
  ];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(normalizedContent)) !== null) {
      for (const name of splitCompetitorChunk(match[1])) {
        names.add(name);
      }
    }
  }

  return Array.from(names);
}

// ═══════════════════════════════════════════════════════════
// Workday Corporate Brand Palette (from official template)
// ═══════════════════════════════════════════════════════════
const WD = {
  // Core palette
  afterHours: "022043",
  ink:        "0F2E66",
  ballpoint:  "0057AE",
  waterCooler:"1C98E8",
  blueSky:    "9ECFFF",
  // Secondary palette
  paper:      "FFFFFF",
  keyboard:   "FCF8E8",
  highlighter:"FFF3A8",
  pencil:     "FDE65E",
  lunchBreak: "FEC10B",
  tack:       "6FC9D3",
  happyHour:  "FD7E00",
  // Functional
  footer:     "94A3B8",
  cardBg:     "0F2E66", // Dark blue (Ink) for card backgrounds
};

const COLORS = {
  bg: WD.paper, titleBg: WD.afterHours, cardBg: WD.cardBg,
  text: WD.ink, textLight: WD.paper, textMuted: WD.footer,
  accent: WD.waterCooler, footer: WD.footer,
  gradientCyan: WD.tack, gradientGold: WD.lunchBreak,
  sectionHeading: WD.waterCooler, // Section headings per brand
};

// ═══════════════════════════════════════════════════════════
// Pixel-perfect template asset loader
// Fetches actual gradient images extracted from the Workday
// corporate PPTX template and converts to base64 for embedding.
// ═══════════════════════════════════════════════════════════
interface TemplateAssets {
  titleGradient: string;   // Full-slide gradient bg (blue→cyan→gold)
  dividerGradient: string; // Left strip gradient (cyan→gold)
  logoWhite: string;       // Workday logo white text + orange arc (for dark bg)
  logoColor: string;       // Workday logo color (navy text + orange arc, for closing slide)
}

let _cachedAssets: TemplateAssets | null = null;

async function loadTemplateAssets(): Promise<TemplateAssets> {
  if (_cachedAssets) return _cachedAssets;

  const assetPaths = {
    titleGradient: "/pptx-assets/title-gradient.jpg",
    dividerGradient: "/pptx-assets/divider-gradient.jpg",
    logoWhite: "/pptx-assets/workday-logo-white.png",
    logoColor: "/pptx-assets/workday-logo-color.png",
  };

  const toBase64 = async (path: string): Promise<string> => {
    const response = await fetch(path);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  const [titleGradient, dividerGradient, logoWhite, logoColor] = await Promise.all([
    toBase64(assetPaths.titleGradient),
    toBase64(assetPaths.dividerGradient),
    toBase64(assetPaths.logoWhite),
    toBase64(assetPaths.logoColor),
  ]);

  _cachedAssets = { titleGradient, dividerGradient, logoWhite, logoColor };
  return _cachedAssets;
}

// ═══════════════════════════════════════════════════════════
// Slide layout helpers — pixel-perfect from Workday template
// ═══════════════════════════════════════════════════════════

/**
 * Title slide — actual gradient background image from template + workday logo
 * Matches template Page 4 exactly.
 */
async function addWorkdayTitleBg(slide: any, _pptx: any, assets: TemplateAssets) {
  // Full-slide gradient background (stretched to fill)
  slide.addImage({
    data: assets.titleGradient,
    x: 0, y: 0, w: 13.33, h: 7.5,
  });
  // Workday logo top-left (preserving ~2:1 aspect ratio)
  slide.addImage({
    data: assets.logoWhite,
    x: 0.6, y: 0.3, w: 2.0, h: 1.0,
  });
}

/**
 * Section divider — left gradient strip + white right half
 * Matches template Page 19 exactly.
 */
async function addWorkdaySectionDivider(slide: any, _pptx: any, assets: TemplateAssets) {
  slide.background = { color: WD.paper };
  // Left gradient strip (≈33% width, matching template)
  slide.addImage({
    data: assets.dividerGradient,
    x: 0, y: 0, w: 4.44, h: 7.5,
  });
  // Footer
  slide.addText("Workday Confidential", {
    x: 0.5, y: 7.0, w: 3.5, h: 0.35,
    fontSize: 9, fontFace: "Calibri", color: WD.footer,
  });
}

/**
 * Content slide chrome — white bg + left gradient strip + footer
 * Matches template Page 20: left vertical gradient strip (cyan→gold)
 * @param withStrip - if true, adds the left gradient strip (use false when content needs full width)
 */
function addWorkdayContentChrome(slide: any, pptx: any, assets?: TemplateAssets, withStrip = false) {
  slide.background = { color: WD.paper };
  if (withStrip && assets) {
    // Left gradient strip (≈8% width, thin accent matching template)
    slide.addImage({
      data: assets.dividerGradient,
      x: 0, y: 0, w: 0.5, h: 7.5,
    });
  }
  slide.addText("Workday Confidential", {
    x: 0.5, y: 7.0, w: 4, h: 0.35,
    fontSize: 9, fontFace: "Calibri", color: WD.footer,
  });
}

/**
 * Closing slide — solid ink blue background + centered workday logo
 * Matches template Page 27 exactly.
 */
async function addWorkdayClosingSlide(slide: any, _pptx: any, assets: TemplateAssets) {
  slide.background = { color: WD.ink };
  // Centered workday logo (white version, ~2:1 aspect ratio preserved)
  slide.addImage({
    data: assets.logoWhite,
    x: 4.67, y: 2.5, w: 4.0, h: 2.0,
  });
}

// ═══════════════════════════════════════════════════════════
// Deck title generation — smart short title from user prompt
// ═══════════════════════════════════════════════════════════

function generateDeckTitle(prompt: string, responseContent?: string): string {
  // Prefer deriving a title from the first sentence of the response content
  if (responseContent) {
    const cleaned = responseContent
      .replace(/\*\*/g, "")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, "")
      .replace(/^#+\s*/gm, "")
      .replace(/\s+/g, " ")
      .trim();

    // Grab the first sentence
    const sentenceMatch = cleaned.match(/^(.+?)[.!?:]\s/);
    const firstSentence = sentenceMatch ? sentenceMatch[1].trim() : cleaned.split("\n")[0].trim();

    // Strip common preamble phrases like "Based on..., here's..."
    const stripped = firstSentence
      .replace(/^(?:Based on .+?,\s*(?:here(?:'s| is| are)\s*)?)/i, "")
      .replace(/^(?:Here(?:'s| is| are)\s+)/i, "")
      .replace(/^(?:This is\s+)/i, "")
      .replace(/^(?:an?\s+)/i, "")
      .trim();

    // Capitalize first letter
    const titled = stripped.charAt(0).toUpperCase() + stripped.slice(1);

    // Fit to 50 chars
    if (titled.length <= 50) return titled;

    // Try clause boundary
    const clauseMatch = titled.match(/^(.{10,50}?)(?:[,;:]\s|\sand\s|\swith\s|\sfor\s|\sin\s|\salong\s)/i);
    if (clauseMatch) return clauseMatch[1].trim();

    // Word-fit
    const words = titled.split(/\s+/);
    let result = "";
    for (const word of words) {
      const candidate = result ? `${result} ${word}` : word;
      if (candidate.length > 50) break;
      result = candidate;
    }
    return result || titled.slice(0, 50);
  }

  // Fallback: use prompt
  let cleaned = prompt
    .replace(/\*\*/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();

  if (cleaned.length <= 42) return cleaned;

  const clauseMatch = cleaned.match(/^(.{10,42}?)(?:[.?!;:,]\s|—|\s[-–]\s|\sand\s|\swith\s|\sfor\s|\sin\s)/i);
  if (clauseMatch) return clauseMatch[1].trim();

  const words = cleaned.split(/\s+/);
  let title = "";
  for (const word of words) {
    const candidate = title ? `${title} ${word}` : word;
    if (candidate.length > 42) break;
    title = candidate;
  }

  return title || cleaned.slice(0, 42);
}

// ═══════════════════════════════════════════════════════════
// AI-powered semantic summarization for slides
// ═══════════════════════════════════════════════════════════

function normalizeSlideText(value: string): string {
  return value
    .replace(/\*\*/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function buildSlideLookupKey(heading: string, bullet: string): string {
  const normalizedHeading = normalizeSlideText(heading) || "__global__";
  const normalizedBullet = normalizeSlideText(bullet);
  return `${normalizedHeading}::${normalizedBullet}`;
}

function toStoredSlideSummaryMetadata(metadata: any): StoredSlideSummaryMetadata | null {
  if (!metadata || typeof metadata !== "object") return null;

  const rawSections = Array.isArray(metadata.slide_section_summaries)
    ? metadata.slide_section_summaries
    : [];

  const sections: SlideSectionSummaryEntry[] = rawSections
    .map((section: any) => {
      if (!section || typeof section !== "object") return null;
      const heading = typeof section.heading === "string" ? section.heading : "";
      const bullets = Array.isArray(section.bullets) ? section.bullets.map((b: unknown) => String(b ?? "")) : [];
      const summaries = Array.isArray(section.summaries) ? section.summaries.map((s: unknown) => String(s ?? "")) : [];
      if (!heading || bullets.length === 0 || summaries.length === 0) return null;
      return {
        heading,
        bullets,
        summaries,
      };
    })
    .filter((section: SlideSectionSummaryEntry | null): section is SlideSectionSummaryEntry => Boolean(section));

  const rawLookup = metadata.slide_summary_lookup;
  const lookup = rawLookup && typeof rawLookup === "object"
    ? Object.fromEntries(
        Object.entries(rawLookup).map(([key, value]) => [String(key), String(value ?? "")]),
      )
    : {};

  if (sections.length === 0 && Object.keys(lookup).length === 0) return null;

  return { sections, lookup };
}

async function loadStoredSlideSummaryMetadata(options?: SlideSummaryOptions): Promise<StoredSlideSummaryMetadata | null> {
  if (options?.traceMetadata) {
    const inline = toStoredSlideSummaryMetadata(options.traceMetadata);
    if (inline) return inline;
  }

  try {
    if (options?.traceId) {
      const { data, error } = await supabase
        .from("agent_traces")
        .select("metadata")
        .eq("id", options.traceId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!error && data?.metadata) {
        const parsed = toStoredSlideSummaryMetadata(data.metadata);
        if (parsed) return parsed;
      }
    }

    if (options?.messageId) {
      const { data, error } = await supabase
        .from("agent_traces")
        .select("metadata")
        .eq("message_id", options.messageId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!error && data?.metadata) {
        const parsed = toStoredSlideSummaryMetadata(data.metadata);
        if (parsed) return parsed;
      }
    }
  } catch (err) {
    console.warn("Failed to load stored slide summaries:", err);
  }

  return null;
}

function getStoredSummaryForBullet(
  bullet: string,
  context: string | undefined,
  stored: StoredSlideSummaryMetadata,
): string | null {
  const withHeadingKey = buildSlideLookupKey(context || "", bullet);
  const globalKey = buildSlideLookupKey("", bullet);

  if (stored.lookup[withHeadingKey]) return stored.lookup[withHeadingKey];
  if (stored.lookup[globalKey]) return stored.lookup[globalKey];

  const normalizedContext = normalizeSlideText(context || "");
  if (normalizedContext) {
    const section = stored.sections.find((entry) => normalizeSlideText(entry.heading) === normalizedContext);
    if (section) {
      const bulletIndex = section.bullets.findIndex((entryBullet) => normalizeSlideText(entryBullet) === normalizeSlideText(bullet));
      if (bulletIndex >= 0 && section.summaries[bulletIndex]) {
        return section.summaries[bulletIndex];
      }
    }
  }

  return null;
}

/**
 * Call the summarize-for-slides edge function to get AI-generated
 * semantic summaries of bullet points for slide readability.
 * Falls back to simple truncation if the AI call fails.
 */
async function summarizeBulletsForSlides(
  bullets: string[],
  context?: string,
  stored?: StoredSlideSummaryMetadata | null,
): Promise<string[]> {
  if (bullets.length === 0) return [];

  const resolvedFromStore: string[] = Array.from({ length: bullets.length }, () => "");
  if (stored) {
    bullets.forEach((bullet, idx) => {
      const storedSummary = getStoredSummaryForBullet(bullet, context, stored);
      if (storedSummary) resolvedFromStore[idx] = storedSummary;
    });
  }

  const missingIndexes = resolvedFromStore
    .map((summary, idx) => ({ idx, summary }))
    .filter((entry) => !entry.summary)
    .map((entry) => entry.idx);

  if (missingIndexes.length === 0) {
    return resolvedFromStore;
  }

  try {
    const missingBullets = missingIndexes.map((idx) => bullets[idx]);
    const { data, error } = await supabase.functions.invoke("summarize-for-slides", {
      body: { bullets: missingBullets, context },
    });
    if (error) throw error;
    if (data?.summaries && Array.isArray(data.summaries)) {
      const summaries = data.summaries as string[];
      missingIndexes.forEach((idx, i) => {
        resolvedFromStore[idx] = summaries[i] || "";
      });
      return resolvedFromStore.map((summary, idx) => {
        if (summary) return summary;
        const cleaned = bullets[idx]
          .replace(/\*\*/g, "")
          .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
          .trim();
        return cleaned;
      });
    }
  } catch (err) {
    console.warn("AI slide summarization failed, using fallback:", err);
  }

  // Fallback: simple cleanup without AI
  return bullets.map((b, idx) => {
    if (resolvedFromStore[idx]) return resolvedFromStore[idx];
    const cleaned = b
      .replace(/\*\*/g, "")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .trim();
    return cleaned;
  });
}

/**
 * Batch-summarize ALL bullets across multiple sections in a SINGLE AI call.
 * Returns a flat array of summaries matching the input order.
 */
async function batchSummarizeAllBullets(
  entries: { bullets: string[]; context: string }[],
  stored?: StoredSlideSummaryMetadata | null,
): Promise<string[][]> {
  // Flatten all bullets with section tracking
  const allBullets: string[] = [];
  const allContexts: string[] = [];
  const sectionOffsets: { start: number; count: number }[] = [];

  for (const entry of entries) {
    const start = allBullets.length;
    for (const b of entry.bullets) {
      allBullets.push(b);
      allContexts.push(entry.context);
    }
    sectionOffsets.push({ start, count: entry.bullets.length });
  }

  if (allBullets.length === 0) {
    return entries.map(() => []);
  }

  // Resolve from store first
  const resolved: string[] = Array.from({ length: allBullets.length }, () => "");
  if (stored) {
    allBullets.forEach((bullet, idx) => {
      const storedSummary = getStoredSummaryForBullet(bullet, allContexts[idx], stored);
      if (storedSummary) resolved[idx] = storedSummary;
    });
  }

  const missingIndexes = resolved
    .map((s, i) => (s ? -1 : i))
    .filter((i) => i !== -1);

  if (missingIndexes.length > 0) {
    try {
      const missingBullets = missingIndexes.map((i) => allBullets[i]);
      const combinedContext = [...new Set(entries.map((e) => e.context))].join(" | ");
      const { data, error } = await supabase.functions.invoke("summarize-for-slides", {
        body: { bullets: missingBullets, context: combinedContext },
      });
      if (!error && data?.summaries && Array.isArray(data.summaries)) {
        missingIndexes.forEach((idx, i) => {
          resolved[idx] = (data.summaries as string[])[i] || "";
        });
      }
    } catch (err) {
      console.warn("Batch AI slide summarization failed, using fallback:", err);
    }
  }

  // Fill any remaining gaps with cleaned text
  resolved.forEach((s, idx) => {
    if (!s) {
      const cleaned = allBullets[idx]
        .replace(/\*\*/g, "")
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
        .trim();
      resolved[idx] = cleaned;
    }
  });

  // Split back into per-section arrays
  return sectionOffsets.map(({ start, count }) => resolved.slice(start, start + count));
}

/**
 * Simple non-AI condense for SWOT overview quadrant (space-constrained).
 */
function condenseBullet(text: string, maxLen = 120): string {
  const cleaned = text
    .replace(/\*\*/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .trim();
  const sentenceMatch = cleaned.match(/^(.+?[.!?])\s/);
  const core = sentenceMatch ? sentenceMatch[1] : cleaned.split(/[;:\u2014\u2013]/)[0].trim();
  return core.length > maxLen ? core.slice(0, maxLen - 1) + "…" : core;
}

/**
 * Condense SWOT bullet items into a concise semantic summary
 * for the 2x2 overview slide. Full details appear on detail slides.
 */
function summarizeSwotItems(items: string[], label: string): string {
  if (items.length === 0) return `• No ${label.toLowerCase()} data available`;
  const summaries = items.slice(0, 5).map((item) => condenseBullet(item, 90));
  return summaries.map((s) => `• ${s}`).join("\n");
}

/**
 * Extract all reference links from markdown content.
 */
function extractAllLinks(content: string): { label: string; url: string }[] {
  const links: { label: string; url: string }[] = [];
  const seen = new Set<string>();
  const regex = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    if (!seen.has(match[2])) {
      seen.add(match[2]);
      links.push({ label: match[1], url: match[2] });
    }
  }
  return links;
}

/**
 * Add a "Reference Links" slide before closing.
 */
function addReferencesSlide(pptx: any, assets: TemplateAssets, links: { label: string; url: string }[]) {
  if (links.length === 0) return;
  const slide = pptx.addSlide();
  addWorkdayContentChrome(slide, pptx, assets, true);
  slide.addText("Reference Links", {
    x: 0.8, y: 0.3, w: 11.5, h: 0.7,
    fontSize: 28, fontFace: "Calibri", color: WD.waterCooler, bold: true,
  });
  slide.addShape(pptx.ShapeType.rect, {
    x: 0.8, y: 1.0, w: 3, h: 0.04,
    fill: { color: WD.waterCooler },
  });
  // Show up to 12 links
  const displayLinks = links.slice(0, 12);
  const linkRows = displayLinks.map((l, i) => ({
    text: `${i + 1}. ${l.label}`,
    options: {
      fontSize: 11, fontFace: "Calibri", color: WD.ballpoint,
      hyperlink: { url: l.url },
      bullet: false,
      breakLine: true,
    },
  }));
  slide.addText(linkRows, {
    x: 0.8, y: 1.3, w: 11.5, h: 5.2,
    valign: "top", lineSpacingMultiple: 1.5, wrap: true,
  });
}

// ═══════════════════════════════════════════════════════════
// SWOT Slide Generation
// ═══════════════════════════════════════════════════════════

export async function generateSwotSlides(
  content: string,
  competitorNames: string[],
  category: string,
  subCategory: string,
  options?: SlideSummaryOptions,
): Promise<void> {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "Comp Intelligence Agent";
  pptx.title = `SWOT Analysis — ${competitorNames.join(" vs ")}`;
  const storedSlideSummaries = await loadStoredSlideSummaryMetadata(options);

  // Load actual template assets
  const assets = await loadTemplateAssets();

  // ── Title Slide (pixel-perfect gradient bg from template) ──
  const titleSlide = pptx.addSlide();
  await addWorkdayTitleBg(titleSlide, pptx, assets);
  const swotDeckTitle = generateDeckTitle(competitorNames.join(" vs ") + " SWOT Analysis", content);
  titleSlide.addText(swotDeckTitle.toUpperCase(), {
    x: 0.8, y: 4.0, w: 11.5, h: 1,
    fontSize: 44, fontFace: "Calibri", color: WD.ink, bold: true,
  });
  titleSlide.addText("Comp Agent Analysis", {
    x: 0.8, y: 5.1, w: 11.5, h: 0.6,
    fontSize: 22, fontFace: "Calibri", color: WD.ink,
  });
  titleSlide.addText(`${category}${subCategory && subCategory !== category ? ` · ${subCategory}` : ""}`, {
    x: 0.8, y: 5.8, w: 11.5, h: 0.5,
    fontSize: 16, fontFace: "Calibri", color: WD.ink, transparency: 30,
  });
  titleSlide.addText(new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }), {
    x: 0.8, y: 6.5, w: 11.5, h: 0.4,
    fontSize: 14, fontFace: "Calibri", color: WD.ink, transparency: 50,
  });

  // ── Parse SWOT for each competitor ──
  for (const comp of competitorNames) {
    const swot = extractSwot(content, comp);

    // Section divider slide (pixel-perfect left gradient strip from template)
    const headerSlide = pptx.addSlide();
    await addWorkdaySectionDivider(headerSlide, pptx, assets);
    headerSlide.addText(comp, {
      x: 5.0, y: 2.0, w: 7.5, h: 1.5,
      fontSize: 40, fontFace: "Calibri", color: WD.ink, bold: true,
    });
    headerSlide.addText("SWOT OVERVIEW", {
      x: 5.0, y: 1.5, w: 7.5, h: 0.5,
      fontSize: 14, fontFace: "Calibri", color: WD.waterCooler, charSpacing: 3,
    });

    // 2x2 SWOT grid slide (content layout from template)
    const gridSlide = pptx.addSlide();
    addWorkdayContentChrome(gridSlide, pptx);
    gridSlide.addText(`${comp} — SWOT Overview`, {
      x: 0.8, y: 0.2, w: 12, h: 0.6,
      fontSize: 24, fontFace: "Calibri", color: WD.ink, bold: true,
    });

    // Use Workday Ink blue for all quadrant accents (consistent brand)
    const quadrantAccent = WD.ink;
    const quadrants = [
      { label: "Strengths", items: swot.strengths, x: 0.6, y: 1.0 },
      { label: "Weaknesses", items: swot.weaknesses, x: 6.8, y: 1.0 },
      { label: "Opportunities", items: swot.opportunities, x: 0.6, y: 4.0 },
      { label: "Threats", items: swot.threats, x: 6.8, y: 4.0 },
    ];

    for (const q of quadrants) {
      // Card background — dark blue (Ink)
      gridSlide.addShape(pptx.ShapeType.rect, {
        x: q.x, y: q.y, w: 6, h: 2.7,
        fill: { color: WD.ink },
        rectRadius: 0.08,
      });
      // Accent top bar — Water Cooler
      gridSlide.addShape(pptx.ShapeType.rect, {
        x: q.x, y: q.y, w: 6, h: 0.06,
        fill: { color: WD.waterCooler },
      });
      // Label — white on dark bg
      gridSlide.addText(q.label.toUpperCase(), {
        x: q.x + 0.3, y: q.y + 0.15, w: 5.4, h: 0.4,
        fontSize: 14, fontFace: "Calibri", color: WD.blueSky, bold: true,
      });
      // Semantic summary — white text on dark bg
      const summaryText = summarizeSwotItems(q.items, q.label);
      gridSlide.addText(summaryText, {
        x: q.x + 0.3, y: q.y + 0.55, w: 5.4, h: 2.05,
        fontSize: 11, fontFace: "Calibri", color: WD.paper,
        valign: "top", lineSpacingMultiple: 1.2,
        wrap: true,
      });
    }

    // Batch-summarize ALL quadrant bullets in a SINGLE AI call
    const quadrantEntries = quadrants
      .filter(q => q.items.length > 0)
      .map(q => ({ bullets: q.items, context: `${comp} SWOT ${q.label}` }));
    const allQuadrantSummarized = await batchSummarizeAllBullets(quadrantEntries, storedSlideSummaries);

    // Map summarized results back to quadrants
    let entryIdx = 0;
    const quadrantSummaryMap = new Map<string, string[]>();
    for (const q of quadrants) {
      if (q.items.length > 0) {
        quadrantSummaryMap.set(q.label, allQuadrantSummarized[entryIdx] || []);
        entryIdx++;
      } else {
        quadrantSummaryMap.set(q.label, []);
      }
    }

    // Individual detail slides for each quadrant
    for (const q of quadrants) {
      if (q.items.length === 0) continue;
      const summarized = quadrantSummaryMap.get(q.label) || [];

      const ITEMS_PER_DETAIL = 4;
      for (let page = 0; page < summarized.length; page += ITEMS_PER_DETAIL) {
        const pageItems = summarized.slice(page, page + ITEMS_PER_DETAIL);
        const detailSlide = pptx.addSlide();
        addWorkdayContentChrome(detailSlide, pptx, assets, true);
        detailSlide.addShape(pptx.ShapeType.rect, {
          x: 0, y: 0, w: 13.33, h: 0.06,
          fill: { color: WD.waterCooler },
        });
        detailSlide.addText(`${comp}`, {
          x: 0.8, y: 0.3, w: 12, h: 0.4,
          fontSize: 14, fontFace: "Calibri", color: WD.footer,
        });
        const pageLabel = summarized.length > ITEMS_PER_DETAIL
          ? `${q.label} (${page / ITEMS_PER_DETAIL + 1}/${Math.ceil(summarized.length / ITEMS_PER_DETAIL)})`
          : q.label;
        detailSlide.addText(pageLabel, {
          x: 0.8, y: 0.7, w: 12, h: 0.6,
          fontSize: 28, fontFace: "Calibri", color: WD.waterCooler, bold: true,
        });

        const bulletContent = pageItems.map((item, idx) => `${page + idx + 1}.  ${item}`).join("\n\n");
        detailSlide.addText(bulletContent, {
          x: 0.8, y: 1.5, w: 11.5, h: 5.2,
          fontSize: 13, fontFace: "Calibri", color: WD.ink,
          valign: "top", lineSpacingMultiple: 1.3,
          wrap: true,
        });
      }
    }
  }

  // ── Summary slide ──
  const summarySlide = pptx.addSlide();
  addWorkdayContentChrome(summarySlide, pptx, assets, true);
  summarySlide.addText("Key Takeaways", {
    x: 0.8, y: 0.5, w: 11.5, h: 0.8,
    fontSize: 34, fontFace: "Calibri", color: WD.waterCooler, bold: true,
  });
  // AI-summarize the top strength and risk for each competitor
  const takeawayBullets = competitorNames.map((comp) => {
    const swot = extractSwot(content, comp);
    const strength = swot.strengths[0] || "Strong market presence";
    const risk = swot.threats[0] || swot.weaknesses[0] || "Competitive pressure";
    return `${comp} — Strength: ${strength} | Risk: ${risk}`;
  });
  const summarizedTakeaways = await summarizeBulletsForSlides(takeawayBullets, "Key competitive takeaways", storedSlideSummaries);
  const takeawaysText = summarizedTakeaways.map((t, i) => `${i + 1}. ${t}`).join("\n\n");
  summarySlide.addText(takeawaysText, {
    x: 0.8, y: 1.5, w: 11.5, h: 5,
    fontSize: 16, fontFace: "Calibri", color: WD.ink,
    valign: "top", lineSpacingMultiple: 1.4, wrap: true,
    shrinkText: false,
  });

  // ── Reference Links slide ──
  const allLinks = extractAllLinks(content);
  addReferencesSlide(pptx, assets, allLinks);

  // ── Closing slide (pixel-perfect from template) ──
  const endSlide = pptx.addSlide();
  await addWorkdayClosingSlide(endSlide, pptx, assets);

  const fileName = `Comp_Agent_Analysis_${competitorNames.join("_vs_")}_${new Date().toISOString().slice(0, 10)}`;
  await pptx.writeFile({ fileName });
}

/**
 * Extract SWOT items for a specific competitor from the content
 */
function extractSwot(content: string, competitor: string): {
  strengths: string[];
  weaknesses: string[];
  opportunities: string[];
  threats: string[];
} {
  const result = { strengths: [] as string[], weaknesses: [] as string[], opportunities: [] as string[], threats: [] as string[] };
  
  const lines = content.split("\n");
  let currentCategory: keyof typeof result | null = null;

  for (const line of lines) {
    const lower = line.toLowerCase().trim();
    
    if (/strength/i.test(lower)) currentCategory = "strengths";
    else if (/weakness|limitation|gap/i.test(lower)) currentCategory = "weaknesses";
    else if (/opportunit/i.test(lower)) currentCategory = "opportunities";
    else if (/threat|risk|challenge/i.test(lower)) currentCategory = "threats";
    else if (/^#{1,2}\s+/.test(line) && !currentCategory) currentCategory = null;

    const bulletMatch = line.match(/^\s*[-*•·]\s+(.+)/);
    if (bulletMatch && currentCategory) {
      const item = bulletMatch[1]
        .replace(/\*\*/g, "")
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
        .trim();
      if (item.length > 5 && item.length < 300) {
        result[currentCategory].push(item);
      }
    }
  }

  if (result.strengths.length > 0 || result.weaknesses.length > 0 || 
      result.opportunities.length > 0 || result.threats.length > 0) {
    return result;
  }

  // Fallback: heuristic classification
  const allBullets = content.match(/^\s*[-*•]\s+(.+)/gm) || [];
  const cleaned = allBullets.map(b => b.replace(/^\s*[-*•]\s+/, "").replace(/\*\*/g, "").trim()).filter(b => b.length > 10);
  
  for (const bullet of cleaned) {
    const lower = bullet.toLowerCase();
    if (/strong|leading|best|excellent|powerful|robust|comprehensive|mature/i.test(lower)) {
      result.strengths.push(bullet);
    } else if (/weak|lack|limited|poor|missing|no support|behind/i.test(lower)) {
      result.weaknesses.push(bullet);
    } else if (/opportunit|potential|could|emerging|growing|expand/i.test(lower)) {
      result.opportunities.push(bullet);
    } else if (/threat|risk|compet|disrupt|pressure|challenge/i.test(lower)) {
      result.threats.push(bullet);
    } else {
      result.strengths.push(bullet);
    }
  }

  return result;
}

// ═══════════════════════════════════════════════════════════
// Feed Slides Generation
// ═══════════════════════════════════════════════════════════

export async function generateFeedSlides(
  content: string,
  title: string,
  options?: SlideSummaryOptions,
  agentType: 'feed' | 'comp' = 'feed',
): Promise<void> {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "Feed Intelligence Agent";
  pptx.title = title;
  const storedSlideSummaries = await loadStoredSlideSummaryMetadata(options);

  // Load actual template assets
  const assets = await loadTemplateAssets();

  // ── Title Slide (pixel-perfect gradient bg from template) ──
  const titleSlide = pptx.addSlide();
  await addWorkdayTitleBg(titleSlide, pptx, assets);
  const deckTitle = generateDeckTitle(title, content);
  titleSlide.addText(deckTitle.toUpperCase(), {
    x: 0.8, y: 4.0, w: 11.5, h: 1,
    fontSize: 40, fontFace: "Calibri", color: WD.ink, bold: true,
  });
  const subHeader = 'Comp Agent Analysis';
  titleSlide.addText(subHeader, {
    x: 0.8, y: 5.1, w: 11.5, h: 0.6,
    fontSize: 20, fontFace: "Calibri", color: WD.ink, transparency: 30,
  });
  titleSlide.addText(new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }), {
    x: 0.8, y: 5.8, w: 11.5, h: 0.5,
    fontSize: 14, fontFace: "Calibri", color: WD.ink, transparency: 50,
  });

  // Parse content into sections
  const sections = parseFeedContentSections(content);

  // Batch-summarize ALL section bullets in a SINGLE AI call
  const sectionEntries = sections.map(s => ({ bullets: s.points, context: s.heading }));
  const allSummarized = await batchSummarizeAllBullets(sectionEntries, storedSlideSummaries);

  for (let sIdx = 0; sIdx < sections.length; sIdx++) {
    const section = sections[sIdx];
    const summarized = allSummarized[sIdx] || [];
    const slide = pptx.addSlide();
    addWorkdayContentChrome(slide, pptx, assets, true);

    slide.addText(section.heading, {
      x: 0.8, y: 0.3, w: 11.5, h: 0.7,
      fontSize: 26, fontFace: "Calibri", color: WD.waterCooler, bold: true,
    });

    slide.addShape(pptx.ShapeType.rect, {
      x: 0.8, y: 1.0, w: 3, h: 0.04,
      fill: { color: WD.waterCooler },
    });

    const POINTS_PER_SLIDE = 4;
    const firstPage = summarized.slice(0, POINTS_PER_SLIDE);
    const bulletText = firstPage.map(p => `• ${p}`).join("\n\n");
    slide.addText(bulletText, {
      x: 0.8, y: 1.3, w: 11.5, h: 5.4,
      fontSize: 12, fontFace: "Calibri", color: WD.ink,
      valign: "top", lineSpacingMultiple: 1.25, wrap: true,
    });

    for (let overflow = POINTS_PER_SLIDE; overflow < summarized.length; overflow += POINTS_PER_SLIDE) {
      const overflowSlide = pptx.addSlide();
      addWorkdayContentChrome(overflowSlide, pptx, assets, true);
      overflowSlide.addText(`${section.heading} (cont.)`, {
        x: 0.8, y: 0.3, w: 11.5, h: 0.7,
        fontSize: 24, fontFace: "Calibri", color: WD.waterCooler, bold: true,
      });
      overflowSlide.addShape(pptx.ShapeType.rect, {
        x: 0.8, y: 1.0, w: 3, h: 0.04,
        fill: { color: WD.waterCooler },
      });
      const overflowPoints = summarized.slice(overflow, overflow + POINTS_PER_SLIDE);
      const overflowText = overflowPoints.map(p => `• ${p}`).join("\n\n");
      overflowSlide.addText(overflowText, {
        x: 0.8, y: 1.3, w: 11.5, h: 5.4,
        fontSize: 12, fontFace: "Calibri", color: WD.ink,
        valign: "top", lineSpacingMultiple: 1.25, wrap: true,
      });
    }
  }

  // Fallback: no sections parsed
  if (sections.length === 0) {
    const allBullets = content.match(/^\s*[-*•]\s+(.+)/gm) || [];
    const cleaned = allBullets.map(b => b.replace(/^\s*[-*•]\s+/, "").replace(/\*\*/g, "").trim()).filter(b => b.length > 10);
    if (cleaned.length > 0) {
      const summarized = await summarizeBulletsForSlides(cleaned, "Key findings", storedSlideSummaries);
      const ITEMS_PER_SLIDE = 5;
      for (let i = 0; i < summarized.length; i += ITEMS_PER_SLIDE) {
        const slide = pptx.addSlide();
        addWorkdayContentChrome(slide, pptx, assets, true);
        slide.addText("Key Findings", {
          x: 0.8, y: 0.3, w: 11.5, h: 0.7,
          fontSize: 26, fontFace: "Calibri", color: WD.waterCooler, bold: true,
        });
        slide.addShape(pptx.ShapeType.rect, {
          x: 0.8, y: 1.0, w: 3, h: 0.04,
          fill: { color: WD.waterCooler },
        });
        const bullets = summarized.slice(i, i + ITEMS_PER_SLIDE).map(p => `• ${p}`).join("\n\n");
        slide.addText(bullets, {
          x: 0.8, y: 1.3, w: 11.5, h: 5.2,
          fontSize: 12, fontFace: "Calibri", color: WD.ink,
          valign: "top", lineSpacingMultiple: 1.3, wrap: true,
        });
      }
    }
  }

  // ── Reference Links slide ──
  const allLinks = extractAllLinks(content);
  addReferencesSlide(pptx, assets, allLinks);

  // ── Closing slide (pixel-perfect from template) ──
  const endSlide = pptx.addSlide();
  await addWorkdayClosingSlide(endSlide, pptx, assets);

  const fileName = `Comp_Agent_Analysis_${new Date().toISOString().slice(0, 10)}`;
  await pptx.writeFile({ fileName });
}

/**
 * Parse feed agent content into slide-friendly sections
 */
function parseFeedContentSections(content: string): { heading: string; points: string[]; links: { label: string; url: string }[] }[] {
  const sections: { heading: string; points: string[]; links: { label: string; url: string }[] }[] = [];
  const lines = content.split("\n");
  let currentHeading = "";
  let currentPoints: string[] = [];
  let currentLinks: { label: string; url: string }[] = [];

  for (const line of lines) {
    const headingMatch = line.match(/^#{1,3}\s+(.+)/);
    if (headingMatch) {
      if (currentHeading && (currentPoints.length > 0 || currentLinks.length > 0)) {
        sections.push({ heading: currentHeading, points: currentPoints, links: currentLinks });
      }
      currentHeading = headingMatch[1].replace(/\*\*/g, "").trim();
      currentPoints = [];
      currentLinks = [];
      continue;
    }

    const bulletMatch = line.match(/^\s*[-*•]\s+(.+)/);
    if (bulletMatch) {
      let text = bulletMatch[1].replace(/\*\*/g, "").trim();
      const linkMatches = [...text.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)];
      for (const lm of linkMatches) {
        currentLinks.push({ label: lm[1], url: lm[2] });
      }
      text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
      if (text.length > 5) {
        currentPoints.push(text);
      }
    }
  }

  if (currentHeading && (currentPoints.length > 0 || currentLinks.length > 0)) {
    sections.push({ heading: currentHeading, points: currentPoints, links: currentLinks });
  }

  return sections;
}

export { extractCompetitorNames };
