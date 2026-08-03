import { requireAuth } from "../_shared/auth.ts";
// Slide-bullet summarizer used by the client PPTX export path
// (src/lib/export-utils.ts). Delegates to the shared
// buildSlideSummaryPayload helper so trace-time and export-time slide
// generation share one model (gpt-5.2 strict), one chunking strategy,
// one set of timeouts, and one diagnostics shape.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  buildSlideSummaryPayload,
  cleanSlideBullet,
  SLIDE_SUMMARY_MODEL,
  type SlideSummaryPayload,
} from "../_shared/slide-summary.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/**
 * The export caller sends a flat list of bullets; the shared helper expects
 * a markdown blob with `## Heading` + `- bullet` structure. We synthesize
 * minimal markdown from the input list, then flatten the resulting section
 * summaries back into a single in-order array to preserve the existing
 * `{ status, summaries }` contract.
 */
function bulletsToMarkdown(bullets: string[]): string {
  return ["## Slide Bullets", ...bullets.map((b) => `- ${b.replace(/\s+/g, " ").trim()}`)].join("\n");
}

function flattenSummaries(payload: SlideSummaryPayload, originalCount: number): string[] {
  const flat: string[] = [];
  for (const section of payload.sections) {
    for (const summary of section.summaries) flat.push(summary);
  }
  return flat.slice(0, originalCount);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // --- Auth guard (shared): valid user JWT or service-role key required ---
  const authError = await requireAuth(req, corsHeaders);
  if (authError) return authError;

  try {
    const { bullets, context } = await req.json();

    if (!Array.isArray(bullets) || bullets.length === 0) {
      return new Response(
        JSON.stringify({ status: "ready", summaries: [], model: SLIDE_SUMMARY_MODEL }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const markdown = bulletsToMarkdown(bullets as string[]);
    const payload = await buildSlideSummaryPayload(markdown, context || "", LOVABLE_API_KEY);

    if (!payload) {
      // No sections were parsed — fall back to deterministic clean text so
      // the export still produces usable slides.
      return new Response(
        JSON.stringify({
          status: "failed",
          error: "no_sections_parsed",
          model: SLIDE_SUMMARY_MODEL,
          summaries: (bullets as string[]).map((b) => cleanSlideBullet(b)),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const summaries = flattenSummaries(payload, bullets.length);

    // Pad with deterministic fallbacks if the helper trimmed input above MAX_BULLETS.
    while (summaries.length < bullets.length) {
      summaries.push(cleanSlideBullet(bullets[summaries.length] as string));
    }

    return new Response(
      JSON.stringify({
        status: "ready",
        summaries,
        model: payload.model,
        version: payload.version,
        diagnostics: payload.diagnostics,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("summarize-for-slides error:", e);
    return new Response(
      JSON.stringify({
        status: "failed",
        error: e instanceof Error ? e.message : "Unknown error",
        model: SLIDE_SUMMARY_MODEL,
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
