// Query-intent classifier — extracts the structured intent of a user query so
// downstream contract checks can validate the response with the user's actual
// expectations in mind (narrow scope, asks for community, asks for media, etc).
//
// Architecture: deterministic regex pre-pass FIRST (catches obvious media/community
// intents and known competitor/sub-area entities), then GPT-5-nano LLM call,
// then a merge step where regex wins on positives — never downgrades a true to false.
//
// PRIVACY: Only the user prompt is sent to the LLM. NO Adaptive Planning
// training-guide content is ever forwarded to external APIs from this module.

import { monitoredFetch } from "./monitored-fetch.ts";

export interface QueryIntent {
  scope: "narrow" | "broad";
  entities: string[];           // narrow concepts (e.g. "ALM", "workflow")
  asksCommunity: boolean;
  asksMedia: boolean;
  asksComparison: boolean;
  competitors: string[];
  depthExpected: "low" | "medium" | "high";
  type: "lookup" | "comparison" | "feature_deep_dive" | "research" | "media_only" | "sentiment" | "other";
}

const FALLBACK_INTENT: QueryIntent = {
  scope: "broad",
  entities: [],
  asksCommunity: false,
  asksMedia: false,
  asksComparison: false,
  competitors: [],
  depthExpected: "medium",
  type: "other",
};

// ---------------------- Deterministic dictionaries ----------------------

// Known competitors — match case-insensitive whole-word/multi-word.
const KNOWN_COMPETITORS: { canonical: string; patterns: RegExp[] }[] = [
  { canonical: "Anaplan",       patterns: [/\banaplan\b/i] },
  { canonical: "Planful",       patterns: [/\bplanful\b/i, /\bhost analytics\b/i] },
  { canonical: "OneStream",     patterns: [/\bonestream\b/i] },
  { canonical: "Pigment",       patterns: [/\bpigment\b/i] },
  { canonical: "Vena",          patterns: [/\bvena(?: solutions)?\b/i] },
  { canonical: "Oracle EPM",    patterns: [/\boracle(?: epm| pbcs| fccs| hyperion| essbase)?\b/i] },
  { canonical: "SAP",           patterns: [/\bsap(?: analytics cloud| bpc| group reporting)?\b/i] },
  { canonical: "IBM TM1",       patterns: [/\bibm(?: planning analytics| cognos)?\b/i, /\btm1\b/i] },
  { canonical: "Datarails",     patterns: [/\bdatarails\b/i] },
  { canonical: "Jedox",         patterns: [/\bjedox\b/i] },
  { canonical: "Workiva",       patterns: [/\bworkiva\b/i] },
  { canonical: "Prophix",       patterns: [/\bprophix\b/i] },
  { canonical: "Board",         patterns: [/\bboard(?: international)?\b/i] },
  { canonical: "CCH Tagetik",   patterns: [/\bcch tagetik\b/i, /\btagetik\b/i] },
];

// Known sub-area / capability terms users ask about narrowly. Surface them as
// entities for downstream lookup-time gallery filtering and contract scoping.
const KNOWN_SUB_AREAS: { canonical: string; patterns: RegExp[] }[] = [
  { canonical: "ALM",                    patterns: [/\bALM\b/, /\bapplication lifecycle management\b/i] },
  { canonical: "workflow",               patterns: [/\bworkflows?\b/i, /\bapprovals?\b/i] },
  { canonical: "modeling",               patterns: [/\bmodeling\b/i, /\bmodel(?:ling)?\b/i] },
  { canonical: "consolidation",          patterns: [/\bconsolidations?\b/i, /\bfinancial close\b/i, /\bintercompany\b/i] },
  { canonical: "workforce planning",     patterns: [/\bworkforce(?: planning)?\b/i, /\bheadcount\b/i] },
  { canonical: "allocations",            patterns: [/\ballocations?\b/i] },
  { canonical: "dashboards",             patterns: [/\bdashboards?\b/i, /\bvisualizations?\b/i] },
  { canonical: "reporting",              patterns: [/\breporting\b/i, /\bofficeconnect\b/i] },
  { canonical: "scenario",               patterns: [/\bscenarios?\b/i, /\bwhat[- ]if\b/i] },
  { canonical: "driver-based planning",  patterns: [/\bdriver[- ]based\b/i] },
  { canonical: "supply chain",           patterns: [/\bsupply chain\b/i, /\bs&op\b/i] },
  { canonical: "predictive forecaster",  patterns: [/\bpredictive(?: forecaster)?\b/i, /\bforecast(?:ing)?\b/i, /\barima\b/i] },
  { canonical: "anomaly detection",      patterns: [/\banomaly detection\b/i] },
  { canonical: "data integration",       patterns: [/\bdata integration\b/i, /\betl\b/i] },
  { canonical: "drill-through",          patterns: [/\bdrill[- ](?:through|down)\b/i] },
  { canonical: "audit trail",            patterns: [/\baudit trail\b/i, /\bcell notes?\b/i] },
];

const HEURISTIC_COMMUNITY = /\b(sentiment|review|reviews|reddit|linkedin|community|user feedback|users? say|users? think|perception|opinion|complaint|complaints|praise|gartner|g2|trustradius|capterra)\b/i;
const HEURISTIC_MEDIA = /\b(media|screenshot|screenshots|image|images|picture|pictures|video|videos|gif|gifs|demo|walkthrough|visual|visuals|show me|see (?:the|a)|\bui\b|interface|any visuals|any media)\b/i;
const HEURISTIC_COMPARISON = /\b(vs\.?|versus|compared to|compare|comparison|differen(?:ce|t) from|how does .+ (?:differ|compare)|adaptive planning vs)\b/i;

interface RegexPrePass {
  asksCommunity: boolean;
  asksMedia: boolean;
  asksComparison: boolean;
  competitors: string[];
  entities: string[];
}

function regexPrePass(prompt: string): RegexPrePass {
  const competitors: string[] = [];
  for (const c of KNOWN_COMPETITORS) {
    if (c.patterns.some((re) => re.test(prompt)) && !competitors.includes(c.canonical)) {
      competitors.push(c.canonical);
    }
  }
  const entities: string[] = [];
  for (const s of KNOWN_SUB_AREAS) {
    if (s.patterns.some((re) => re.test(prompt)) && !entities.includes(s.canonical)) {
      entities.push(s.canonical);
    }
  }
  return {
    asksCommunity: HEURISTIC_COMMUNITY.test(prompt),
    asksMedia: HEURISTIC_MEDIA.test(prompt),
    asksComparison: HEURISTIC_COMPARISON.test(prompt),
    competitors,
    entities,
  };
}

export async function classifyQueryIntent(userPrompt: string): Promise<QueryIntent> {
  if (!userPrompt || !userPrompt.trim()) return FALLBACK_INTENT;

  const pre = regexPrePass(userPrompt);

  // Deterministic narrow scope rule: if user named a competitor AND a sub-area
  // entity AND asked for media → it's narrow regardless of LLM output.
  const deterministicNarrow =
    pre.entities.length > 0 && pre.competitors.length > 0 && pre.asksMedia;

  const heuristic: QueryIntent = {
    ...FALLBACK_INTENT,
    asksCommunity: pre.asksCommunity,
    asksMedia: pre.asksMedia,
    asksComparison: pre.asksComparison,
    competitors: pre.competitors,
    entities: pre.entities,
    scope: deterministicNarrow ? "narrow" : "broad",
    type: pre.asksMedia && pre.entities.length > 0 ? "media_only" : "other",
  };

  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) return heuristic;

  try {
    const res = await monitoredFetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${LOVABLE_API_KEY}` },
      body: JSON.stringify({
        model: "openai/gpt-5.5",
        messages: [{
          role: "user",
          content: `Classify the following competitive-intelligence user query. Return STRICT JSON only — no prose, no markdown.

Schema:
{
  "scope": "narrow" | "broad",
  "entities": string[],          // narrow concepts the user asks about (e.g. "ALM", "workflow"). [] if broad.
  "asksCommunity": boolean,      // true if user wants sentiment/reviews/community/perception
  "asksMedia": boolean,          // true if user wants screenshots/videos/visuals/UI/media
  "asksComparison": boolean,     // true if user wants vs-Adaptive or vs-other comparison
  "competitors": string[],       // competitor names explicitly mentioned
  "depthExpected": "low" | "medium" | "high",
  "type": "lookup" | "comparison" | "feature_deep_dive" | "research" | "media_only" | "sentiment" | "other"
}

Rules:
- "narrow" = the user names a specific feature, capability, or sub-concept (e.g. "ALM", "predictive forecaster", "workflow approvals"). "entities" must list those exact terms.
- "broad" = generic ask about a product or category as a whole.
- Be precise; do not invent entities the user did not say.

Few-shot examples:
- "Is there any media that specifically shows Anaplan ALM?"
  → {"scope":"narrow","entities":["ALM"],"asksCommunity":false,"asksMedia":true,"asksComparison":false,"competitors":["Anaplan"],"depthExpected":"low","type":"media_only"}
- "show me screenshots of Pigment workflow approvals"
  → {"scope":"narrow","entities":["workflow"],"asksMedia":true,"asksCommunity":false,"asksComparison":false,"competitors":["Pigment"],"depthExpected":"low","type":"media_only"}
- "any visuals of OneStream consolidation?"
  → {"scope":"narrow","entities":["consolidation"],"asksMedia":true,"asksCommunity":false,"asksComparison":false,"competitors":["OneStream"],"depthExpected":"low","type":"media_only"}
- "tell me about Anaplan"
  → {"scope":"broad","entities":[],"asksMedia":false,"asksCommunity":false,"asksComparison":false,"competitors":["Anaplan"],"depthExpected":"medium","type":"lookup"}
- "what do users say about Pigment on reddit"
  → {"scope":"broad","entities":[],"asksMedia":false,"asksCommunity":true,"asksComparison":false,"competitors":["Pigment"],"depthExpected":"medium","type":"sentiment"}

USER QUERY: ${JSON.stringify(userPrompt.slice(0, 1500))}`,
        }],
        max_completion_tokens: 300,
      }),
    }, { keyName: "LOVABLE_API_KEY", service: "lovable", edgeFunction: "query-intent" });

    if (!res.ok) return heuristic;
    const data = await res.json();
    const raw = data.choices?.[0]?.message?.content || "";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return heuristic;
    const parsed = JSON.parse(jsonMatch[0]);

    // Merge LLM output with regex pre-pass. Regex wins on positives — it never
    // downgrades a true to false. Entities/competitors are unioned.
    const llmEntities = Array.isArray(parsed.entities) ? parsed.entities.map((s: any) => String(s)).filter(Boolean) : [];
    const llmCompetitors = Array.isArray(parsed.competitors) ? parsed.competitors.map((s: any) => String(s)).filter(Boolean) : [];
    const mergedEntities = Array.from(new Set([...pre.entities, ...llmEntities])).slice(0, 10);
    const mergedCompetitors = Array.from(new Set([...pre.competitors, ...llmCompetitors])).slice(0, 10);

    const mergedAsksMedia = !!parsed.asksMedia || pre.asksMedia;
    const mergedAsksCommunity = !!parsed.asksCommunity || pre.asksCommunity;
    const mergedAsksComparison = !!parsed.asksComparison || pre.asksComparison;

    // Final scope: narrow if EITHER deterministic rule fired OR LLM said narrow
    // AND we actually have entities to scope by.
    const llmScope = parsed.scope === "narrow" ? "narrow" : "broad";
    const finalScope: "narrow" | "broad" =
      (deterministicNarrow || (llmScope === "narrow" && mergedEntities.length > 0))
        ? "narrow"
        : "broad";

    return {
      scope: finalScope,
      entities: mergedEntities,
      asksCommunity: mergedAsksCommunity,
      asksMedia: mergedAsksMedia,
      asksComparison: mergedAsksComparison,
      competitors: mergedCompetitors,
      depthExpected: ["low", "medium", "high"].includes(parsed.depthExpected) ? parsed.depthExpected : "medium",
      type: ["lookup", "comparison", "feature_deep_dive", "research", "media_only", "sentiment", "other"].includes(parsed.type) ? parsed.type : (mergedAsksMedia && mergedEntities.length > 0 ? "media_only" : "other"),
    };
  } catch (e) {
    console.error("classifyQueryIntent error:", e);
    return heuristic;
  }
}

// Build a token-set from intent.entities for cheap relevance matching.
export function buildEntityMatchers(entities: string[]): RegExp[] {
  const matchers: RegExp[] = [];
  for (const ent of entities) {
    const t = ent.trim();
    if (t.length < 2) continue;
    const esc = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    matchers.push(new RegExp(`\\b${esc}\\b`, "i"));
  }
  return matchers;
}
