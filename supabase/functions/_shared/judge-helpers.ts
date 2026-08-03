// Judge/evaluation helpers — extracted from chat-analysis for bundle size optimization

import { monitoredFetch } from "./monitored-fetch.ts";

export interface JudgeEvaluation {
  factual_correctness: { score: number; reasoning: string };
  structural_clarity: { score: number; reasoning: string };
  depth_of_comparison: { score: number; reasoning: string };
  visual_evidence: { score: number; reasoning: string };
  citation_coverage: { score: number; reasoning: string };
  actionability: { score: number; reasoning: string };
  media_quality: { score: number; reasoning: string };
  overall_score: number;
  overall_summary: string;
  improvement_suggestions: string[];
  weights_used?: JudgeWeights;
}

export interface JudgeWeights {
  factual_correctness: number;
  structural_clarity: number;
  depth_of_comparison: number;
  visual_evidence: number;
  citation_coverage: number;
  actionability: number;
  media_quality: number;
}

// Default rubric (sums to 1.00)
const DEFAULT_WEIGHTS: JudgeWeights = {
  factual_correctness: 0.22,
  depth_of_comparison: 0.22,
  structural_clarity: 0.13,
  actionability: 0.13,
  citation_coverage: 0.10,
  visual_evidence: 0.10,
  media_quality: 0.10,
};

// Media-only / non-comparison redistribution: zero out depth_of_comparison
// and redistribute its 22% proportionally across the remaining 6 criteria.
const MEDIA_ONLY_WEIGHTS: JudgeWeights = {
  factual_correctness: 0.28,
  depth_of_comparison: 0.00,
  structural_clarity: 0.15,
  actionability: 0.16,
  citation_coverage: 0.13,
  visual_evidence: 0.15,
  media_quality: 0.13,
};

export interface IntentHint {
  type?: string;
  asksComparison?: boolean;
}

export function pickJudgeWeights(intent?: IntentHint | null): JudgeWeights {
  if (!intent) return DEFAULT_WEIGHTS;
  if (intent.type === "media_only" || intent.asksComparison === false) return MEDIA_ONLY_WEIGHTS;
  return DEFAULT_WEIGHTS;
}

function computeOverallFromWeights(scores: JudgeEvaluation, weights: JudgeWeights): number {
  const w = weights;
  const sum =
    (scores.factual_correctness?.score ?? 0) * w.factual_correctness +
    (scores.depth_of_comparison?.score ?? 0) * w.depth_of_comparison +
    (scores.structural_clarity?.score ?? 0) * w.structural_clarity +
    (scores.actionability?.score ?? 0) * w.actionability +
    (scores.citation_coverage?.score ?? 0) * w.citation_coverage +
    (scores.visual_evidence?.score ?? 0) * w.visual_evidence +
    (scores.media_quality?.score ?? 0) * w.media_quality;
  return Math.round(sum * 10) / 10;
}

const JUDGE_TOOL = {
  type: "function" as const,
  function: {
    name: "submit_evaluation",
    description: "Submit a structured evaluation of a competitive analysis response.",
    parameters: {
      type: "object",
      properties: {
        factual_correctness: { type: "object", properties: { score: { type: "number" }, reasoning: { type: "string" } }, required: ["score", "reasoning"], additionalProperties: false },
        structural_clarity: { type: "object", properties: { score: { type: "number" }, reasoning: { type: "string" } }, required: ["score", "reasoning"], additionalProperties: false },
        depth_of_comparison: { type: "object", properties: { score: { type: "number" }, reasoning: { type: "string" } }, required: ["score", "reasoning"], additionalProperties: false },
        visual_evidence: { type: "object", properties: { score: { type: "number" }, reasoning: { type: "string" } }, required: ["score", "reasoning"], additionalProperties: false },
        citation_coverage: { type: "object", properties: { score: { type: "number" }, reasoning: { type: "string" } }, required: ["score", "reasoning"], additionalProperties: false },
        actionability: { type: "object", properties: { score: { type: "number" }, reasoning: { type: "string" } }, required: ["score", "reasoning"], additionalProperties: false },
        media_quality: { type: "object", properties: { score: { type: "number" }, reasoning: { type: "string" } }, required: ["score", "reasoning"], additionalProperties: false },
        overall_score: { type: "number" },
        overall_summary: { type: "string" },
        improvement_suggestions: { type: "array", items: { type: "string" } },
      },
      required: ["factual_correctness", "structural_clarity", "depth_of_comparison", "visual_evidence", "citation_coverage", "actionability", "media_quality", "overall_score", "overall_summary", "improvement_suggestions"],
      additionalProperties: false,
    }
  }
};

export async function evaluateResponse(
  content: string,
  competitor: string,
  subCategory: string,
  intentHint?: IntentHint | null,
): Promise<JudgeEvaluation | null> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) return null;

  const weights = pickJudgeWeights(intentHint);
  const isMediaOnly = weights === MEDIA_ONLY_WEIGHTS;

  const weightingLine = isMediaOnly
    ? `Weighting (intent=media_only/non-comparison — Depth of Comparison is INTENTIONALLY ZEROED): factual_correctness(28%) + actionability(16%) + structural_clarity(15%) + visual_evidence(15%) + citation_coverage(13%) + media_quality(13%). Score depth_of_comparison honestly but it does NOT affect the overall.`
    : `Weighting: factual_correctness(22%) + depth_of_comparison(22%) + structural_clarity(13%) + actionability(13%) + citation_coverage(10%) + visual_evidence(10%) + media_quality(10%).`;

  try {
    const res = await monitoredFetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${LOVABLE_API_KEY}` },
      body: JSON.stringify({
        model: "openai/gpt-5.5",
        messages: [{
          role: "user",
          content: `You are an expert Competitive Intelligence Quality Judge. Evaluate this competitive analysis of "${competitor}" vs Workday Adaptive Planning in "${subCategory}".

Score each criterion 1-10 with specific reasoning. ${weightingLine}

RESPONSE TO EVALUATE:
${content.slice(0, 12000)}`,
        }],
        tools: [JUDGE_TOOL],
        tool_choice: { type: "function", function: { name: "submit_evaluation" } },
      }),
    }, { keyName: "LOVABLE_API_KEY", service: "lovable", edgeFunction: "judge-helpers" });

    if (!res.ok) return null;
    const data = await res.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    let parsed: JudgeEvaluation | null = null;
    if (toolCall?.function?.arguments) {
      parsed = JSON.parse(toolCall.function.arguments) as JudgeEvaluation;
    } else {
      const raw = data.choices?.[0]?.message?.content || "";
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) parsed = JSON.parse(jsonMatch[0]) as JudgeEvaluation;
    }
    if (!parsed) return null;

    // Recompute overall_score using the chosen weight set so media-only queries
    // are not penalized for depth_of_comparison even if the model included it.
    parsed.overall_score = computeOverallFromWeights(parsed, weights);
    parsed.weights_used = weights;
    return parsed;
  } catch (e) {
    console.error("Judge error:", e);
    return null;
  }
}
