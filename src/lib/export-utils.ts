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
      body { font-family: Archivo, Calibri, Arial, sans-serif; font-size: 11pt; color: #222; line-height: 1.6; max-width: 800px; margin: 0 auto; padding: 40px; }
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
    fontSize: 9, fontFace: "Archivo", color: WD.footer,
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
    fontSize: 9, fontFace: "Archivo", color: WD.footer,
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

const GENERIC_DECK_HEADINGS = new Set([
  "analysis",
  "executive summary",
  "introduction",
  "overview",
  "summary",
  "visual overview",
  "key findings",
  "key themes",
  "reference links",
  "references",
  "conclusion",
  "appendix",
  "strengths",
  "weaknesses",
  "opportunities",
  "threats",
  "swot overview",
  "latest news",
  "news summary",
  "community summary",
  "sentiment analysis",
  "competitive signals",
  "threats & opportunities",
  "key takeaways",
]);

function cleanDeckTitleText(value: string): string {
  return value
    .replace(/\*\*/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function fitDeckTitle(value: string, maxLen = 60): string {
  const cleaned = cleanDeckTitleText(value);
  if (cleaned.length <= maxLen) return cleaned;

  const words = cleaned.split(/\s+/);
  let result = "";
  for (const word of words) {
    const candidate = result ? `${result} ${word}` : word;
    if (candidate.length > maxLen) break;
    result = candidate;
  }

  return result || cleaned.slice(0, maxLen);
}

function isGenericDeckHeading(value: string): boolean {
  const normalized = cleanDeckTitleText(value).toLowerCase();
  return GENERIC_DECK_HEADINGS.has(normalized) || /^(?:.+\s)?overview$/.test(normalized);
}

function deriveDeckTitleFromPrompt(prompt: string): string | null {
  const cleaned = cleanDeckTitleText(prompt);
  if (!cleaned) return null;

  const subjectNames = extractCompetitorNames(cleaned);
  const subject = subjectNames.length > 0 ? subjectNames.join(" vs ") : "";
  const isFullProduct = /\bfull products?\b|\bfull product\b/i.test(cleaned);
  const contextMatch = cleaned.match(/\bcontext of\s+([^.?!]+?)(?:\s*\(([^)]+)\))?(?:[.?!]|$)/i);

  if (subject && isFullProduct) {
    return fitDeckTitle(`${subject} - Full Product Analysis`);
  }

  if (subject && contextMatch) {
    const scope = cleanDeckTitleText(contextMatch[1]).replace(/^the\s+/i, "");
    return fitDeckTitle(`${subject} - ${scope} Analysis`);
  }

  if (subject && /\b(swot|competitive analysis|comparison|compare|comparing|analysis)\b/i.test(cleaned)) {
    return fitDeckTitle(`${subject} - Competitive Analysis`);
  }

  const timeMatch = cleaned.match(/\b(last week|last month|last quarter|last year)\b/i);
  const competitorMentionMatch = cleaned.match(/\b(?:about|for)\s+([A-Za-z0-9&+.' -]{2,60})\b/i);
  const feedLabel = /\bcommunity\b/i.test(cleaned)
    ? "Community"
    : /\bnews\b/i.test(cleaned)
      ? "News"
      : /\bfeed\b/i.test(cleaned)
        ? "Feed"
        : "";

  if (feedLabel) {
    const subjectLabel = competitorMentionMatch
      ? fitDeckTitle(competitorMentionMatch[1].replace(/\b(?:articles?|posts?|discussions?)\b/gi, "").trim(), 28)
      : "";
    const periodLabel = timeMatch ? ` - ${timeMatch[1].replace(/\b\w/g, (c) => c.toUpperCase())}` : "";
    return fitDeckTitle(subjectLabel ? `${subjectLabel} ${feedLabel} Summary${periodLabel}` : `${feedLabel} Summary${periodLabel}`);
  }

  return null;
}

function generateDeckTitle(prompt: string, responseContent?: string): string {
  const promptDerivedTitle = deriveDeckTitleFromPrompt(prompt);
  if (promptDerivedTitle) return promptDerivedTitle;

  if (responseContent) {
    const headings = [...responseContent.matchAll(/^#{1,3}\s+(.+)$/gm)]
      .map((match) => cleanDeckTitleText(match[1]))
      .filter((heading) => heading.length >= 5 && heading.length <= 70 && !isGenericDeckHeading(heading) && !/^visual\s*overview$/i.test(heading));

    if (headings.length > 0) {
      return fitDeckTitle(headings[0]);
    }

    const cleaned = responseContent
      .replace(/^#+\s*.+$/gm, "")
      .replace(/\s+/g, " ")
      .trim();

    const sentenceMatch = cleaned.match(/^(.+?)[.!?:]\s/);
    const firstSentence = sentenceMatch ? sentenceMatch[1].trim() : cleaned.split("\n")[0].trim();

    const stripped = cleanDeckTitleText(firstSentence)
      .replace(/^(?:Based on .+?,\s*(?:here(?:'s| is| are)\s*)?)/i, "")
      .replace(/^(?:Here(?:'s| is| are)\s+)/i, "")
      .replace(/^(?:This is\s+)/i, "")
      .replace(/^(?:Below is\s+)/i, "")
      .replace(/^(?:The following is\s+)/i, "")
      .replace(/^(?:an?\s+)/i, "")
      .replace(/^(?:Executive\s+Summary\s*[-–:.]?\s*)/i, "")
      .trim();

    if (stripped) {
      return fitDeckTitle(stripped, 50);
    }
  }

  const cleanedPrompt = cleanDeckTitleText(prompt);
  if (cleanedPrompt.length <= 42) return cleanedPrompt;

  const clauseMatch = cleanedPrompt.match(/^(.{10,42}?)(?:[.?!;:,]\s|—|\s[-–]\s|\sand\s|\swith\s|\sfor\s|\sin\s)/i);
  if (clauseMatch) return clauseMatch[1].trim();

  return fitDeckTitle(cleanedPrompt, 42);
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
 * Extract all reference links from markdown content.
 */
function extractAllLinks(content: string): { label: string; url: string }[] {
  const links: { label: string; url: string }[] = [];
  const seen = new Set<string>();
  // Skip image markdown (![alt](url)) — only match text links [label](url)
  const regex = /(?<!!)\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    const url = match[2];
    // Filter out media/screenshot URLs
    const isMedia = /\.(png|jpg|jpeg|gif|webp|svg|bmp|ico)(\?|$)/i.test(url)
      || /competitor-screenshots/i.test(url)
      || /\/storage\/v1\/object\/public\//i.test(url);
    if (!isMedia && !seen.has(url)) {
      seen.add(url);
      links.push({ label: match[1], url });
    }
  }

  // Second pass: capture bare URLs not inside markdown link syntax
  const bareUrlRegex = /(?<!\]\()https?:\/\/[^\s)<>]+/g;
  let bareMatch;
  while ((bareMatch = bareUrlRegex.exec(content)) !== null) {
    const url = bareMatch[0];
    const isMedia = /\.(png|jpg|jpeg|gif|webp|svg|bmp|ico)(\?|$)/i.test(url)
      || /competitor-screenshots/i.test(url)
      || /\/storage\/v1\/object\/public\//i.test(url);
    if (!isMedia && !seen.has(url)) {
      seen.add(url);
      links.push({ label: url, url });
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
    fontSize: 28, fontFace: "Archivo", color: WD.waterCooler, bold: true,
  });
  slide.addShape(pptx.ShapeType.rect, {
    x: 0.8, y: 1.0, w: 3, h: 0.04,
    fill: { color: WD.waterCooler },
  });
  // Show up to 12 links
  const displayLinks = links.slice(0, 12);
  const linkRows = displayLinks.map((l, i) => ({
    text: `${i + 1}. ${l.url}`,
    options: {
      fontSize: 11, fontFace: "Archivo", color: WD.ballpoint,
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
// Height estimation helpers for dynamic slide pagination
// ═══════════════════════════════════════════════════════════

const MAX_CONTENT_HEIGHT = 5.65; // usable zone: y=1.3 to y=6.95

function estimateBulletHeight(text: string, fontSize = 12, boxWidth = 11.5): number {
  const charsPerLine = Math.floor(boxWidth * (140 / 11.5)); // ~140 chars at 11.5"
  const lines = Math.max(1, Math.ceil(text.length / charsPerLine));
  const lineHeight = (fontSize / 72) * 1.25; // inches
  return lines * lineHeight + 0.15; // + paragraph spacing
}

function estimateTableRowHeight(cells: string[], colWidths: number[], fontSize = 10): number {
  const charsPerInch = 14; // approx at 10pt Archivo
  let maxLines = 1;
  cells.forEach((cell, i) => {
    const width = colWidths[i] || 1;
    const charsPerLine = Math.floor(width * charsPerInch);
    const lines = Math.max(1, Math.ceil(cleanCellText(cell).length / charsPerLine));
    maxLines = Math.max(maxLines, lines);
  });
  const lineHeight = (fontSize / 72) * 1.2;
  return Math.max(maxLines * lineHeight + 0.08, 0.4);
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
    fontSize: 40, fontFace: "Archivo", color: WD.ink, bold: true,
  });
  const subHeader = 'Comp Agent Analysis';
  titleSlide.addText(subHeader, {
    x: 0.8, y: 5.1, w: 11.5, h: 0.6,
    fontSize: 20, fontFace: "Archivo", color: WD.ink, transparency: 30,
  });
  titleSlide.addText(new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }), {
    x: 0.8, y: 5.8, w: 11.5, h: 0.5,
    fontSize: 14, fontFace: "Archivo", color: WD.ink, transparency: 50,
  });

  // Strip "Reference Links" section before parsing — it's handled separately by addReferencesSlide
  const refLinksPattern = /^#{1,3}\s*Reference\s*Links[\s\S]*/im;
  const contentWithoutRefLinks = content.replace(refLinksPattern, "").trim();

  // Parse content into sections (handles tables, paragraphs, bullets)
  const allSections = parseFeedContentSections(contentWithoutRefLinks);

  // Visual Overview is chat-only — drop it before slide generation so PPTX
  // doesn't render image/video markdown tokens that PowerPoint can't resolve.
  const sections = allSections.filter(
    (s) => !/^visual\s*overview$/i.test((s.heading || "").trim()),
  );

  // Separate table sections from bullet/paragraph sections for different rendering
  for (let sIdx = 0; sIdx < sections.length; sIdx++) {
    const section = sections[sIdx];

    // ── Table sections: render as native PPTX tables ──
    if (section.table && section.table.length > 0) {
      const table = section.table;
      const headerRow = table[0];
      const dataRows = table.slice(1);
      const colCount = headerRow.length;

      // Calculate column widths upfront for height estimation
      const tableW = 11.7;
      const colWidths = colCount <= 2
        ? Array(colCount).fill(tableW / colCount)
        : [tableW * 0.22, ...Array(colCount - 1).fill((tableW * 0.78) / (colCount - 1))];

      // Split data rows into pages using dynamic height budget
      const HEADER_ROW_HEIGHT = 0.5;

      let pageStart = 0;
      while (pageStart < dataRows.length) {
        let usedHeight = HEADER_ROW_HEIGHT;
        let pageEnd = pageStart;
        while (pageEnd < dataRows.length) {
          const rowHeight = estimateTableRowHeight(dataRows[pageEnd], colWidths);
          if (usedHeight + rowHeight > MAX_CONTENT_HEIGHT && pageEnd > pageStart) break;
          usedHeight += rowHeight;
          pageEnd++;
        }
        const pageRows = dataRows.slice(pageStart, pageEnd);
        const slide = pptx.addSlide();
        addWorkdayContentChrome(slide, pptx, assets, true);

        const headingLabel = pageStart === 0 ? section.heading : `${section.heading} (cont.)`;
        slide.addText(headingLabel, {
          x: 0.8, y: 0.3, w: 11.5, h: 0.6,
          fontSize: 22, fontFace: "Archivo", color: WD.waterCooler, bold: true,
        });
        slide.addShape(pptx.ShapeType.rect, {
          x: 0.8, y: 0.85, w: 3, h: 0.04,
          fill: { color: WD.waterCooler },
        });

        // Build table rows for PptxGenJS (reuse colWidths from above)

        // Build table rows for PptxGenJS
        const tblRows: any[][] = [];

        // Header row
        tblRows.push(
          headerRow.map((cell) => ({
            text: cleanCellText(cell),
            options: {
              bold: true, fontSize: 9, fontFace: "Archivo", color: WD.paper,
              fill: { color: WD.ink }, valign: "middle",
              border: { pt: 0.5, color: WD.blueSky },
              margin: [4, 4, 4, 4],
            },
          }))
        );

        // Data rows with alternating background
        for (let rIdx = 0; rIdx < pageRows.length; rIdx++) {
          const row = pageRows[rIdx];
          const bgColor = rIdx % 2 === 0 ? "F5F7FA" : WD.paper;
          tblRows.push(
            row.map((cell, cIdx) => ({
              text: cleanCellText(cell),
              options: {
                fontSize: 10, fontFace: "Archivo", color: WD.ink,
                fill: { color: bgColor }, valign: "top",
                bold: cIdx === 0,
                border: { pt: 0.5, color: "E2E8F0" },
                margin: [3, 3, 3, 3],
              },
            }))
          );
        }

        // Compute per-row heights for the table
        const rowHeights = [HEADER_ROW_HEIGHT, ...pageRows.map(r => estimateTableRowHeight(r, colWidths))];

        slide.addTable(tblRows, {
          x: 0.8, y: 1.05, w: tableW,
          colW: colWidths,
          rowH: rowHeights,
          border: { pt: 0.5, color: "E2E8F0" },
          autoPage: false,
        });

        pageStart = pageEnd;
      }
      continue;
    }

    // ── Bullet / paragraph sections: summarize and render as bullet points ──
    if (section.points.length === 0) continue;

    // Summarize in batch (single AI call handled upstream)
    const summarized = await summarizeBulletsForSlides(section.points, section.heading, storedSlideSummaries);

    let bPageStart = 0;
    while (bPageStart < summarized.length) {
      let usedHeight = 0;
      let bPageEnd = bPageStart;
      while (bPageEnd < summarized.length) {
        const itemHeight = estimateBulletHeight(`• ${summarized[bPageEnd]}`);
        if (usedHeight + itemHeight > MAX_CONTENT_HEIGHT && bPageEnd > bPageStart) break;
        usedHeight += itemHeight;
        bPageEnd++;
      }
      const pagePoints = summarized.slice(bPageStart, bPageEnd);
      const slide = pptx.addSlide();
      addWorkdayContentChrome(slide, pptx, assets, true);

      const headingLabel = bPageStart === 0 ? section.heading : `${section.heading} (cont.)`;
      slide.addText(headingLabel, {
        x: 0.8, y: 0.3, w: 11.5, h: 0.7,
        fontSize: 26, fontFace: "Archivo", color: WD.waterCooler, bold: true,
      });
      slide.addShape(pptx.ShapeType.rect, {
        x: 0.8, y: 1.0, w: 3, h: 0.04,
        fill: { color: WD.waterCooler },
      });

      const contentHeight = Math.min(usedHeight + 0.3, MAX_CONTENT_HEIGHT);
      const bulletText = pagePoints.map(p => `• ${p}`).join("\n\n");
      slide.addText(bulletText, {
        x: 0.8, y: 1.3, w: 11.5, h: contentHeight,
        fontSize: 12, fontFace: "Archivo", color: WD.ink,
        valign: "top", lineSpacingMultiple: 1.25, wrap: true,
      });
      bPageStart = bPageEnd;
    }
  }

  // Fallback: no sections parsed at all
  if (sections.length === 0) {
    const allBullets = content.match(/^\s*[-*•]\s+(.+)/gm) || [];
    const cleaned = allBullets.map(b => b.replace(/^\s*[-*•]\s+/, "").replace(/\*\*/g, "").trim()).filter(b => b.length > 10);
    if (cleaned.length > 0) {
      const summarized = await summarizeBulletsForSlides(cleaned, "Key findings", storedSlideSummaries);
      let fbStart = 0;
      while (fbStart < summarized.length) {
        let usedHeight = 0;
        let fbEnd = fbStart;
        while (fbEnd < summarized.length) {
          const itemHeight = estimateBulletHeight(`• ${summarized[fbEnd]}`);
          if (usedHeight + itemHeight > MAX_CONTENT_HEIGHT && fbEnd > fbStart) break;
          usedHeight += itemHeight;
          fbEnd++;
        }
        const slide = pptx.addSlide();
        addWorkdayContentChrome(slide, pptx, assets, true);
        slide.addText("Key Findings", {
          x: 0.8, y: 0.3, w: 11.5, h: 0.7,
          fontSize: 26, fontFace: "Archivo", color: WD.waterCooler, bold: true,
        });
        slide.addShape(pptx.ShapeType.rect, {
          x: 0.8, y: 1.0, w: 3, h: 0.04,
          fill: { color: WD.waterCooler },
        });
        const fbContentHeight = Math.min(usedHeight + 0.3, MAX_CONTENT_HEIGHT);
        const bullets = summarized.slice(fbStart, fbEnd).map(p => `• ${p}`).join("\n\n");
        slide.addText(bullets, {
          x: 0.8, y: 1.3, w: 11.5, h: fbContentHeight,
          fontSize: 12, fontFace: "Archivo", color: WD.ink,
          valign: "top", lineSpacingMultiple: 1.3, wrap: true,
        });
        fbStart = fbEnd;
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
 * Clean markdown formatting from a table cell for PPTX display.
 */
function cleanCellText(cell: string): string {
  return cell
    .replace(/\*\*/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "")
    .trim();
}

/**
 * Parse feed agent content into slide-friendly sections.
 * Handles markdown headings, bullet points, tables, and paragraphs.
 */
function parseFeedContentSections(content: string): { heading: string; points: string[]; links: { label: string; url: string }[]; table?: string[][] }[] {
  const sections: { heading: string; points: string[]; links: { label: string; url: string }[]; table?: string[][] }[] = [];
  const lines = content.split("\n");
  let currentHeading = "";
  let currentPoints: string[] = [];
  let currentLinks: { label: string; url: string }[] = [];
  let currentTable: string[][] = [];
  let inTable = false;

  const flushSection = () => {
    if (!currentHeading) return;
    if (currentTable.length > 1) {
      // Table section (has header + at least 1 data row)
      sections.push({ heading: currentHeading, points: [], links: currentLinks, table: currentTable });
    } else if (currentPoints.length > 0) {
      sections.push({ heading: currentHeading, points: currentPoints, links: currentLinks });
    }
    currentPoints = [];
    currentLinks = [];
    currentTable = [];
    inTable = false;
  };

  for (const line of lines) {
    const trimmed = line.trim();

    // ── Heading ──
    const headingMatch = trimmed.match(/^#{1,3}\s+(.+)/);
    if (headingMatch) {
      flushSection();
      currentHeading = headingMatch[1].replace(/\*\*/g, "").trim();
      continue;
    }

    // ── Table row ──
    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      const cells = trimmed.split("|").slice(1, -1).map(c => c.trim());
      // Skip separator rows (e.g. |---|---|)
      if (cells.every(c => /^[\s\-:]+$/.test(c))) {
        continue;
      }
      inTable = true;
      currentTable.push(cells);
      continue;
    }

    // If we were in a table and hit a non-table line, the table ended
    if (inTable && trimmed !== "") {
      // Don't flush yet — more content under the same heading
      inTable = false;
    }

    // ── Bullet point ──
    const bulletMatch = trimmed.match(/^\s*[-*•]\s+(.+)/);
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
      continue;
    }

    // ── Paragraph text ──
    if (trimmed.length > 20 && currentHeading && !trimmed.startsWith("|")) {
      // Collect substantial paragraph text as a "point"
      let text = trimmed
        .replace(/\*\*/g, "")
        .replace(/!\[([^\]]*)\]\([^)]+\)/g, "")  // strip images
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
        .trim();
      if (text.length > 20) {
        currentPoints.push(text);
      }
    }
  }

  flushSection();

  return sections;
}

export { extractCompetitorNames };
