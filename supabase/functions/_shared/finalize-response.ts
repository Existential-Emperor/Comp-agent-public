// Pure response finalization. No IO. No network. No DB. No stream writes.
//
// Inputs:
//   - the raw model markdown
//   - the EvidenceSourceRegistry built up during retrieval
//   - the allowed media URL set (anti-fabrication)
//
// Output:
//   - finalized markdown
//   - structured diagnostics describing what was changed
//
// All previously-scattered cleanup steps live here exactly once:
//   - empty-href markdown link stripping ([Source]())
//   - relative [Source](/path) repair against known URLs (or strip)
//   - fabricated image/video URL stripping
//   - visual-media URL scrubbing from ## Sources / ## Reference Links
//   - canonical ## Sources rendering from the registry
//   - inline [Source](url) normalization against the registry
//
// The orchestrator runs the response contract / judge as separate stages and
// passes their output back in as structured data — finalization itself never
// calls them.

import type { EvidenceSource } from "./pipeline-types.ts";
import { EvidenceSourceRegistry } from "./evidence-source-registry.ts";

export interface FinalizeInput {
  markdown: string;
  registry: EvidenceSourceRegistry;
  allowedMediaUrls: Set<string>;
  /** When true, append a canonical ## Sources section from the registry. */
  appendCanonicalSources?: boolean;
}

export interface FinalizeDiagnostics {
  emptyCitationsStripped: number;
  relativeLinksRepaired: number;
  relativeLinksStripped: number;
  fabricatedImagesStripped: number;
  fabricatedVideosStripped: number;
  visualUrlsScrubbedFromSources: number;
  inlineCitationsNormalized: number;
  inlineCitationsDropped: number;
  canonicalSourcesAppended: boolean;
}

export interface FinalizeOutput {
  markdown: string;
  diagnostics: FinalizeDiagnostics;
}

const VISUAL_URL_PATTERNS = [
  /\.(?:png|jpe?g|gif|webp|svg|mp4|webm|mov|ogg)(?:\?|$)/i,
  /competitor-screenshots/i,
  /\/storage\/v1\/object\/public\//i,
  /youtube\.com\/watch|youtu\.be\//i,
  /vimeo\.com\/|wistia\.com\/|vidyard\.com\/|loom\.com\//i,
];

function isVisualUrl(u: string): boolean {
  return VISUAL_URL_PATTERNS.some((re) => re.test(u));
}

export function finalizeResponse(input: FinalizeInput): FinalizeOutput {
  const diag: FinalizeDiagnostics = {
    emptyCitationsStripped: 0,
    relativeLinksRepaired: 0,
    relativeLinksStripped: 0,
    fabricatedImagesStripped: 0,
    fabricatedVideosStripped: 0,
    visualUrlsScrubbedFromSources: 0,
    inlineCitationsNormalized: 0,
    inlineCitationsDropped: 0,
    canonicalSourcesAppended: false,
  };

  let md = input.markdown ?? "";

  // 1. Empty-href cleanup: [Source](), [Source]( ).
  md = md.replace(/\[[^\]]*\]\(\s*\)/g, () => {
    diag.emptyCitationsStripped++;
    return "";
  });

  // 2. Relative [label](/path) repair against known URLs in the registry.
  const knownUrls = input.registry
    .list()
    .map((s) => s.url)
    .filter((u): u is string => !!u);
  md = md.replace(
    /\[([^\]]+)\]\((?!https?:|mailto:|tel:|#)([^)]+)\)/g,
    (_m, label: string, href: string) => {
      const tail = href.trim();
      const recovered = knownUrls.find((u) => u.endsWith(tail) || u.includes(tail));
      if (recovered) {
        diag.relativeLinksRepaired++;
        return `[${label}](${recovered})`;
      }
      diag.relativeLinksStripped++;
      return label;
    },
  );

  // 3. Anti-fabrication for inline images / videos.
  md = md.replace(/!\[[^\]]*\]\((https?:\/\/[^)]+)\)/g, (match, url: string) => {
    const norm = url.replace(/\?.*$/, "");
    if (input.allowedMediaUrls.has(norm)) return match;
    for (const allowed of input.allowedMediaUrls) {
      if (norm.startsWith(allowed) || allowed.startsWith(norm)) return match;
    }
    diag.fabricatedImagesStripped++;
    return "";
  });
  md = md.replace(/\[VIDEO:[^\]]*\]\((https?:\/\/[^)]+)\)/g, (match, url: string) => {
    const norm = url.replace(/\?.*$/, "");
    if (input.allowedMediaUrls.has(norm)) return match;
    for (const allowed of input.allowedMediaUrls) {
      if (norm.startsWith(allowed) || allowed.startsWith(norm)) return match;
    }
    diag.fabricatedVideosStripped++;
    return "";
  });

  // 4. Inline [label](url) normalization against registry.
  //    URLs the registry knows about pass through unchanged. URLs it does NOT
  //    know about are kept (model may have introduced a valid link), but if
  //    the URL is malformed or domain-only it gets dropped.
  md = md.replace(
    /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g,
    (_m, label: string, url: string) => {
      const cleanUrl = url.replace(/[)>\].,;:!?\"']+$/g, "");
      const resolved = input.registry.resolve(cleanUrl);
      if (resolved) {
        diag.inlineCitationsNormalized++;
        return `[${label}](${resolved.url ?? cleanUrl})`;
      }
      // Drop domain-only links (no path / single-char path).
      try {
        const path = new URL(cleanUrl).pathname;
        if (!path || path === "/" || path.length <= 1) {
          diag.inlineCitationsDropped++;
          return label;
        }
      } catch {
        diag.inlineCitationsDropped++;
        return label;
      }
      return `[${label}](${cleanUrl})`;
    },
  );

  // 5. Scrub visual-media URLs from ## Sources / ## Reference Links.
  const scrubSection = (text: string, headingRe: RegExp): string => {
    return text.replace(headingRe, (block) => {
      const lines = block.split("\n");
      const kept = lines.filter((line, idx) => {
        if (idx === 0) return true;
        const urls = line.match(/https?:\/\/[^\s)\]\"]+/g) ?? [];
        if (urls.length === 0) return true;
        const allVisual = urls.every((u) => isVisualUrl(u.replace(/[.,;:!?)]+$/, "")));
        if (allVisual) diag.visualUrlsScrubbedFromSources++;
        return !allVisual;
      });
      return kept.join("\n");
    });
  };
  md = scrubSection(md, /##\s+Sources?\s*\n[\s\S]*?(?=\n##\s|$)/i);
  md = scrubSection(md, /##\s+Reference\s*Links?\s*\n[\s\S]*?(?=\n##\s|$)/i);

  // 6. Canonical ## Sources from the registry. Only if requested AND if the
  //    response does not already end with a non-empty Sources block. We never
  //    modify a Sources block the model rendered itself unless step 5 emptied it.
  if (input.appendCanonicalSources) {
    const sources = input.registry
      .list()
      .filter((s) => s.url || s.docRef)
      .slice(0, 12);
    if (sources.length > 0 && !hasNonEmptySourcesBlock(md)) {
      md = md.replace(/\n##\s+(?:Sources?|Reference\s*Links?)\s*\n[\s\S]*$/i, "").trimEnd();
      md += `\n\n## Sources\n\n${sources.map(renderSourceLine).join("\n")}\n`;
      diag.canonicalSourcesAppended = true;
    }
  }

  // 7. Whitespace tidy.
  md = md.replace(/[ \t]{2,}/g, " ").replace(/[ \t]+([.,;:!?])/g, "$1");
  md = md.replace(/\n{3,}/g, "\n\n").trim();

  return { markdown: md, diagnostics: diag };
}

function hasNonEmptySourcesBlock(md: string): boolean {
  const m = md.match(/##\s+(?:Sources?|Reference\s*Links?)\s*\n([\s\S]*?)(?=\n##\s|$)/i);
  if (!m) return false;
  return /\S/.test(m[1] ?? "");
}

function renderSourceLine(s: EvidenceSource): string {
  if (s.url) return `- [${s.label}](${s.url})`;
  if (s.docRef) return `- ${s.label} (${s.docRef})`;
  return `- ${s.label}`;
}
