// Slide summary generation helpers — extracted from chat-analysis for bundle size optimization
//
// gpt-5.2 strict pipeline:
//   - Single source of truth for the model (SLIDE_SUMMARY_MODEL).
//   - Per-chunk AbortController (35s) so a slow chunk degrades to deterministic
//     fallback instead of nuking the whole payload.
//   - Outer budget cap (75s) shared across all chunks.
//   - Concurrency-2 semaphore (gpt-5.2 reasoning calls trigger 429s if fanned out).
//   - chunkSize = 12 (gpt-5.2 + JSON-array structured output is super-linear).
//   - reasoning.effort = "low" (terse 280-char rewrites don't need more).
//   - max_completion_tokens = 6000 (reasoning tokens count against the cap).
//   - Per-chunk diagnostics returned alongside the payload.

export const SLIDE_SUMMARY_MODEL = "openai/gpt-5.5";
export const SLIDE_SUMMARY_REASONING_EFFORT = "low";
export const SLIDE_SUMMARY_VERSION = 2;

const PER_CHUNK_TIMEOUT_MS = 35_000;
const OUTER_BUDGET_MAX_MS = 75_000;
const OUTER_BUDGET_PER_CHUNK_MS = 12_000;
const OUTER_BUDGET_FLOOR_MS = 15_000;
const CHUNK_SIZE = 12;
const MAX_BULLETS = 120;
const MAX_CONCURRENCY = 2;

export type SlideSectionSummary = {
  heading: string;
  bullets: string[];
  summaries: string[];
};

export type SlideChunkDiagnostic = {
  chunkIndex: number;
  items: number;
  attempt: number;
  latencyMs: number;
  httpStatus: number | null;
  ok: boolean;
  abortReason: string | null;
  rateLimitRemaining: string | null;
  rateLimitReset: string | null;
  errorSnippet: string | null;
  fallbackUsed: boolean;
};

export type SlideSummaryDiagnostics = {
  model: string;
  version: number;
  reasoningEffort: string;
  totalMs: number;
  chunkCount: number;
  chunkLatenciesMs: number[];
  fallbacksUsed: number;
  rateLimitHits: number;
  outerBudgetMs: number;
  outerBudgetExceeded: boolean;
  chunks: SlideChunkDiagnostic[];
};

export type SlideSummaryPayload = {
  sections: SlideSectionSummary[];
  lookup: Record<string, string>;
  generated_at: string;
  model: string;
  version: number;
  diagnostics: SlideSummaryDiagnostics;
};

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

export function cleanSlideBullet(text: string, _maxLen?: number): string {
  return text
    .replace(/\*\*/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseContentSectionsForSlides(content: string): { heading: string; bullets: string[] }[] {
  const lines = content.split("\n");
  const sections: { heading: string; bullets: string[] }[] = [];
  let currentHeading = "Key Findings";
  let currentBullets: string[] = [];

  const flush = () => {
    if (currentBullets.length === 0) return;
    sections.push({ heading: currentHeading, bullets: currentBullets });
    currentBullets = [];
  };

  for (const rawLine of lines) {
    const headingMatch = rawLine.match(/^#{1,3}\s+(.+)/);
    if (headingMatch) {
      flush();
      currentHeading = headingMatch[1].replace(/\*\*/g, "").trim() || "Key Findings";
      continue;
    }

    const bulletMatch = rawLine.match(/^\s*[-*•]\s+(.+)/);
    if (bulletMatch) {
      const cleaned = cleanSlideBullet(bulletMatch[1]);
      if (cleaned.length > 8) currentBullets.push(cleaned);
    }
  }

  flush();
  return sections;
}

type ChunkResult = { summaries: string[]; diagnostic: SlideChunkDiagnostic };

async function summarizeSlideChunk(
  LOVABLE_API_KEY: string,
  chunk: Array<{ heading: string; bullet: string }>,
  context: string | undefined,
  chunkIndex: number,
  outerSignal: AbortSignal,
): Promise<ChunkResult> {
  const baseDiagnostic: SlideChunkDiagnostic = {
    chunkIndex,
    items: chunk.length,
    attempt: 1,
    latencyMs: 0,
    httpStatus: null,
    ok: false,
    abortReason: null,
    rateLimitRemaining: null,
    rateLimitReset: null,
    errorSnippet: null,
    fallbackUsed: false,
  };

  if (chunk.length === 0) {
    return {
      summaries: [],
      diagnostic: { ...baseDiagnostic, ok: true, fallbackUsed: false },
    };
  }

  const fallback = (): string[] => chunk.map((item) => cleanSlideBullet(item.bullet));

  // Bail early if the outer budget has already been exceeded.
  if (outerSignal.aborted) {
    return {
      summaries: fallback(),
      diagnostic: { ...baseDiagnostic, fallbackUsed: true, abortReason: "outer_budget_pre_start" },
    };
  }

  const numberedBullets = chunk
    .map((item, i) => `[${i + 1}] Section: ${item.heading}\nBullet: ${item.bullet}`)
    .join("\n\n");

  const systemPrompt = `You rewrite detailed analysis bullets into concise slide bullets.

Rules:
- Preserve the FULL meaning and key recommendation/finding
- Use 1-2 sentences max
- Max 280 characters per summary
- No markdown, citations, or links
- Keep original order
- Return ONLY a JSON array of strings
- Array length must be exactly ${chunk.length}`;

  const userPrompt = `${context ? `Context: ${context}\n\n` : ""}Summarize each bullet:\n\n${numberedBullets}`;

  const perChunkController = new AbortController();
  const perChunkTimer = setTimeout(() => perChunkController.abort("per_chunk_timeout"), PER_CHUNK_TIMEOUT_MS);
  const onOuterAbort = () => perChunkController.abort("outer_budget_exceeded");
  outerSignal.addEventListener("abort", onOuterAbort, { once: true });

  const startedAt = Date.now();

  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: SLIDE_SUMMARY_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_completion_tokens: 6000,
        // NOTE: The Lovable AI Gateway currently rejects the `reasoning` param
        // for openai/gpt-5.5 ("Unknown parameter: 'reasoning'."). Omit it so
        // every chunk succeeds; reasoning effort is implicit on this model.
      }),
      signal: perChunkController.signal,
    });

    const latencyMs = Date.now() - startedAt;
    baseDiagnostic.latencyMs = latencyMs;
    baseDiagnostic.httpStatus = response.status;
    baseDiagnostic.rateLimitRemaining = response.headers.get("x-ratelimit-remaining");
    baseDiagnostic.rateLimitReset = response.headers.get("x-ratelimit-reset");

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      baseDiagnostic.errorSnippet = errText.slice(0, 300);
      console.error(
        `[slide-summary] chunk ${chunkIndex} HTTP ${response.status} after ${latencyMs}ms:`,
        baseDiagnostic.errorSnippet,
      );
      return {
        summaries: fallback(),
        diagnostic: { ...baseDiagnostic, fallbackUsed: true },
      };
    }

    const data = await response.json();
    const rawContent = data.choices?.[0]?.message?.content || "[]";
    const jsonMatch = rawContent.match(/\[[\s\S]*\]/);

    let parsed: string[] = [];
    try {
      parsed = JSON.parse(jsonMatch?.[0] || "[]");
    } catch {
      parsed = rawContent
        .split("\n")
        .map((line: string) => line.replace(/^\d+[.)]\s*/, "").replace(/^[-*•]\s*/, "").trim())
        .filter((line: string) => line.length > 4);
    }

    let fallbackUsed = false;
    while (parsed.length < chunk.length) {
      parsed.push(cleanSlideBullet(chunk[parsed.length].bullet));
      fallbackUsed = true;
    }

    const summaries = parsed.slice(0, chunk.length).map((value) => cleanSlideBullet(value));
    console.log(
      `[slide-summary] chunk ${chunkIndex} ok items=${chunk.length} latencyMs=${latencyMs} fallbackUsed=${fallbackUsed}`,
    );

    return {
      summaries,
      diagnostic: { ...baseDiagnostic, ok: true, fallbackUsed },
    };
  } catch (err) {
    const latencyMs = Date.now() - startedAt;
    const reason =
      perChunkController.signal.aborted
        ? (typeof perChunkController.signal.reason === "string"
            ? perChunkController.signal.reason
            : "aborted")
        : err instanceof Error
          ? err.name
          : "unknown_error";
    baseDiagnostic.latencyMs = latencyMs;
    baseDiagnostic.abortReason = reason;
    baseDiagnostic.errorSnippet = err instanceof Error ? err.message.slice(0, 300) : String(err).slice(0, 300);
    console.error(`[slide-summary] chunk ${chunkIndex} aborted/exception after ${latencyMs}ms:`, reason);
    return {
      summaries: fallback(),
      diagnostic: { ...baseDiagnostic, fallbackUsed: true },
    };
  } finally {
    clearTimeout(perChunkTimer);
    outerSignal.removeEventListener("abort", onOuterAbort);
  }
}

async function runWithConcurrency<T>(
  tasks: Array<() => Promise<T>>,
  limit: number,
): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let cursor = 0;
  const workers: Promise<void>[] = [];
  const workerCount = Math.max(1, Math.min(limit, tasks.length));

  for (let w = 0; w < workerCount; w++) {
    workers.push((async () => {
      while (true) {
        const idx = cursor++;
        if (idx >= tasks.length) break;
        results[idx] = await tasks[idx]();
      }
    })());
  }

  await Promise.all(workers);
  return results;
}

export async function buildSlideSummaryPayload(
  content: string,
  context: string,
  LOVABLE_API_KEY: string,
): Promise<SlideSummaryPayload | null> {
  const startedAt = Date.now();
  const parsedSections = parseContentSectionsForSlides(content);
  if (parsedSections.length === 0) return null;

  const flatItems: Array<{ heading: string; bullet: string; sectionIdx: number; bulletIdx: number }> = [];
  parsedSections.forEach((section, sectionIdx) => {
    section.bullets.forEach((bullet, bulletIdx) => {
      flatItems.push({ heading: section.heading, bullet, sectionIdx, bulletIdx });
    });
  });

  if (flatItems.length === 0) return null;

  const limitedItems = flatItems.slice(0, MAX_BULLETS);
  const chunks: Array<Array<{ heading: string; bullet: string }>> = [];
  for (let i = 0; i < limitedItems.length; i += CHUNK_SIZE) {
    chunks.push(
      limitedItems.slice(i, i + CHUNK_SIZE).map((item) => ({ heading: item.heading, bullet: item.bullet })),
    );
  }

  const outerBudgetMs = Math.min(
    OUTER_BUDGET_MAX_MS,
    Math.max(OUTER_BUDGET_FLOOR_MS, chunks.length * OUTER_BUDGET_PER_CHUNK_MS + OUTER_BUDGET_FLOOR_MS),
  );

  const outerController = new AbortController();
  const outerTimer = setTimeout(() => outerController.abort("outer_budget_exceeded"), outerBudgetMs);

  let chunkResults: ChunkResult[];
  try {
    chunkResults = await runWithConcurrency(
      chunks.map((chunk, idx) => () =>
        summarizeSlideChunk(LOVABLE_API_KEY, chunk, context, idx, outerController.signal),
      ),
      MAX_CONCURRENCY,
    );
  } finally {
    clearTimeout(outerTimer);
  }

  const summaryList = chunkResults.flatMap((r) => r.summaries);

  const summaryByKey = new Map<string, string>();
  limitedItems.forEach((item, idx) => {
    summaryByKey.set(`${item.sectionIdx}:${item.bulletIdx}`, summaryList[idx] || cleanSlideBullet(item.bullet));
  });

  const sections: SlideSectionSummary[] = parsedSections.map((section, sectionIdx) => {
    const summaries = section.bullets.map((bullet, bulletIdx) => {
      return summaryByKey.get(`${sectionIdx}:${bulletIdx}`) || cleanSlideBullet(bullet);
    });
    return {
      heading: section.heading,
      bullets: section.bullets,
      summaries,
    };
  });

  const lookup: Record<string, string> = {};
  for (const section of sections) {
    for (let i = 0; i < section.bullets.length; i++) {
      const bullet = section.bullets[i];
      const summary = section.summaries[i] || cleanSlideBullet(bullet);
      lookup[buildSlideLookupKey(section.heading, bullet)] = summary;
      lookup[buildSlideLookupKey("", bullet)] = summary;
    }
  }

  const totalMs = Date.now() - startedAt;
  const chunkDiagnostics = chunkResults.map((r) => r.diagnostic);
  const diagnostics: SlideSummaryDiagnostics = {
    model: SLIDE_SUMMARY_MODEL,
    version: SLIDE_SUMMARY_VERSION,
    reasoningEffort: SLIDE_SUMMARY_REASONING_EFFORT,
    totalMs,
    chunkCount: chunks.length,
    chunkLatenciesMs: chunkDiagnostics.map((d) => d.latencyMs),
    fallbacksUsed: chunkDiagnostics.filter((d) => d.fallbackUsed).length,
    rateLimitHits: chunkDiagnostics.filter((d) => d.httpStatus === 429).length,
    outerBudgetMs,
    outerBudgetExceeded: outerController.signal.aborted,
    chunks: chunkDiagnostics,
  };

  return {
    sections,
    lookup,
    generated_at: new Date().toISOString(),
    model: SLIDE_SUMMARY_MODEL,
    version: SLIDE_SUMMARY_VERSION,
    diagnostics,
  };
}
