// FTS-backed retrieval over the adaptive_planning_kb table.
// Returns the top-N most relevant doc snippets for a query.
// Uses the service-role client so the chunks never go through the browser
// or any external API — they are injected directly into the LLM prompt.

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

let cachedClient: SupabaseClient | null = null;
function getServiceClient(): SupabaseClient {
  if (cachedClient) return cachedClient;
  cachedClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
  return cachedClient;
}

interface RetrieveOpts {
  query: string;
  competitor?: string;
  subCategory?: string;
  /** how many chunks to inject into the prompt */
  maxChunks?: number;
  /** how many candidates to fetch from FTS before truncating */
  candidateLimit?: number;
  /**
   * When true, after FTS narrows candidates we ask a small LLM (Gemini Flash Lite)
   * to extract the exact answer-bearing snippets from the top passages.
   * Falls back gracefully to plain FTS context if the LLM call fails.
   */
  hybridExtract?: boolean;
}

interface DocChunk {
  source_doc: string;
  section_path: string | null;
  title: string | null;
  content: string;
  rank: number;
}

interface RetrieveResult {
  context: string;
  sources: { doc: string; section: string | null; title: string | null }[];
  hitCount: number;
  /** "fts" or "hybrid" — useful for tracing/observability */
  mode?: "fts" | "hybrid";
  /** LLM-extracted brief when hybridExtract=true */
  extracted?: string;
}

const SHORT_TTL_MS = 60_000;
const cache = new Map<string, { value: RetrieveResult; expires: number }>();
// Roadmap retrieval keeps its OWN cache — keys never shared with the adaptive cache.
const roadmapCache = new Map<string, { value: RetrieveResult; expires: number }>();

function buildQuery(opts: RetrieveOpts): string {
  const parts: string[] = [];
  if (opts.competitor) parts.push(`${opts.competitor} vs Workday Adaptive Planning`);
  if (opts.subCategory) parts.push(opts.subCategory);
  parts.push(opts.query);
  // Strip punctuation that confuses websearch_to_tsquery
  return parts.join(" ").replace(/[^\w\s-]/g, " ").replace(/\s+/g, " ").trim();
}

export async function retrieveDocKnowledge(opts: RetrieveOpts): Promise<RetrieveResult> {
  const maxChunks = opts.maxChunks ?? 6;
  const candidateLimit = opts.candidateLimit ?? 30;
  const q = buildQuery(opts);

  const cacheKey = `${q}|${maxChunks}`;
  const hit = cache.get(cacheKey);
  if (hit && hit.expires > Date.now()) return hit.value;

  if (!q || q.length < 3) {
    return { context: "", sources: [], hitCount: 0 };
  }

  try {
    const supabase = getServiceClient();
    const { data, error } = await supabase.rpc("search_adaptive_kb", {
      q,
      max_rows: candidateLimit,
    });
    if (error) {
      console.error("[kb-doc-retrieval] rpc error", error.message);
      return { context: "", sources: [], hitCount: 0 };
    }

    const rows = (data ?? []) as DocChunk[];
    const top = rows.slice(0, maxChunks);

    const context = top
      .map((r) => {
        const tag = `[${r.source_doc}${r.section_path ? ` › ${r.section_path}` : ""}]`;
        const heading = r.title ? `**${r.title}**` : "";
        return `${tag}\n${heading ? heading + "\n" : ""}${r.content}`;
      })
      .join("\n\n---\n\n");

    let extracted: string | undefined;
    let mode: "fts" | "hybrid" = "fts";
    if (opts.hybridExtract && top.length > 0) {
      try {
        extracted = await extractAnswerSnippets(opts.query, top);
        if (extracted) mode = "hybrid";
      } catch (e) {
        console.error("[kb-doc-retrieval] extractor failed, falling back to FTS", e);
      }
    }

    const result: RetrieveResult = {
      context: extracted ? `${extracted}\n\n--- Supporting passages ---\n\n${context}` : context,
      sources: top.map((r) => ({ doc: r.source_doc, section: r.section_path, title: r.title })),
      hitCount: rows.length,
      mode,
      extracted,
    };
    cache.set(cacheKey, { value: result, expires: Date.now() + SHORT_TTL_MS });
    return result;
  } catch (e) {
    console.error("[kb-doc-retrieval] unexpected error", e);
    return { context: "", sources: [], hitCount: 0, mode: "fts" };
  }
}

// -----------------------------------------------------------------------------
// Roadmap KB retrieval — mirrors retrieveDocKnowledge exactly (same two-stage
// hybrid: FTS narrowing via search_roadmap_kb, then the SAME LLM extractor on
// top candidates; same 10000-char passage cap, candidateLimit/maxChunks shape,
// 60s cache, and inert-fallback shape). The ONLY differences: a separate RPC,
// a separate cache Map, and passages tagged [roadmap: …] so the analyst can
// never confuse future/unreleased capability with current capability.
// -----------------------------------------------------------------------------
export async function retrieveRoadmapKnowledge(opts: RetrieveOpts): Promise<RetrieveResult> {
  const maxChunks = opts.maxChunks ?? 6;
  const candidateLimit = opts.candidateLimit ?? 30;
  const q = buildQuery(opts);

  const cacheKey = `${q}|${maxChunks}`;
  const hit = roadmapCache.get(cacheKey);
  if (hit && hit.expires > Date.now()) return hit.value;

  if (!q || q.length < 3) {
    return { context: "", sources: [], hitCount: 0 };
  }

  try {
    const supabase = getServiceClient();
    const { data, error } = await supabase.rpc("search_roadmap_kb", {
      q,
      max_rows: candidateLimit,
    });
    if (error) {
      console.error("[kb-roadmap-retrieval] rpc error", error.message);
      return { context: "", sources: [], hitCount: 0 };
    }

    const rows = (data ?? []) as DocChunk[];
    const top = rows.slice(0, maxChunks);

    const context = top
      .map((r) => {
        const tag = `[roadmap: ${r.source_doc}${r.section_path ? ` › ${r.section_path}` : ""}]`;
        const heading = r.title ? `**${r.title}**` : "";
        // Same passage cap as the adaptive path so a large whole-doc row still
        // reaches the extractor / prompt intact without blowing the budget.
        const body = r.content.length > 10000 ? r.content.slice(0, 10000) + "…" : r.content;
        return `${tag}\n${heading ? heading + "\n" : ""}${body}`;
      })
      .join("\n\n---\n\n");

    let extracted: string | undefined;
    let mode: "fts" | "hybrid" = "fts";
    if (opts.hybridExtract && top.length > 0) {
      try {
        extracted = await extractAnswerSnippets(opts.query, top);
        if (extracted) mode = "hybrid";
      } catch (e) {
        console.error("[kb-roadmap-retrieval] extractor failed, falling back to FTS", e);
      }
    }

    const result: RetrieveResult = {
      context: extracted ? `${extracted}\n\n--- Supporting passages ---\n\n${context}` : context,
      sources: top.map((r) => ({ doc: r.source_doc, section: r.section_path, title: r.title })),
      hitCount: rows.length,
      mode,
      extracted,
    };
    roadmapCache.set(cacheKey, { value: result, expires: Date.now() + SHORT_TTL_MS });
    return result;
  } catch (e) {
    console.error("[kb-roadmap-retrieval] unexpected error", e);
    return { context: "", sources: [], hitCount: 0, mode: "fts" };
  }
}

// -----------------------------------------------------------------------------
// Hybrid stage 2: LLM extractor.
// We send only the top FTS passages (already vetted by Postgres) — never the
// full corpus and never any user PII — to Lovable AI Gateway. The model is
// instructed to quote/paraphrase ONLY from the supplied passages, with citations.
// -----------------------------------------------------------------------------

const EXTRACTOR_MODEL = "openai/gpt-5.5";
const LOVABLE_AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

async function extractAnswerSnippets(query: string, passages: DocChunk[]): Promise<string> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) return "";

  const numbered = passages
    .map((p, i) => {
      const tag = `[${i + 1}] ${p.source_doc}${p.section_path ? ` › ${p.section_path}` : ""}${p.title ? ` — ${p.title}` : ""}`;
      // Cap each passage so a large heading-split chunk still reaches the extractor
      // intact. 10000 chars × maxChunks 12 ≈ 120KB input — well within gpt-5.5's window.
      const body = p.content.length > 10000 ? p.content.slice(0, 10000) + "…" : p.content;
      return `${tag}\n${body}`;
    })
    .join("\n\n---\n\n");

  const system = `You are an extraction module for a competitive-intelligence agent.
You will receive a user question and a numbered list of passages from the official Workday Adaptive Planning documentation.
Your job: extract ONLY the facts from those passages that directly answer the question. Do NOT use outside knowledge. Do NOT speculate.

Rules:
- Quote or tightly paraphrase from the passages only.
- Every bullet must end with a citation like [1] or [2,3] referencing the passage numbers.
- If the passages do not answer the question, reply exactly: "No direct answer in supplied passages."
- Output 3–8 short bullets, no preamble, no closing remarks.`;

  const user = `Question: ${query}\n\nPassages:\n${numbered}`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12_000);
  try {
    const res = await fetch(LOVABLE_AI_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: ctrl.signal,
      body: JSON.stringify({
        model: EXTRACTOR_MODEL,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    if (!res.ok) {
      console.error("[kb-doc-retrieval] extractor HTTP", res.status);
      return "";
    }
    const j = await res.json();
    const text = j?.choices?.[0]?.message?.content?.trim() ?? "";
    if (!text || /no direct answer/i.test(text)) return "";
    return `**Extracted answer (cited to passages below):**\n${text}`;
  } finally {
    clearTimeout(timer);
  }
}
