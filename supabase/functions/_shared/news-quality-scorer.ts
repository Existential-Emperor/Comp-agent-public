// LLM-based final quality gate for news items.
// Mirrors community-quality-scorer.ts: deterministic filters do the cheap
// high-volume rejection, this gate handles the residual cases (nav-menu
// mentions, earnings-scheduling notices, commissioned surveys, listing
// pages) where vocabulary is ambiguous but a model reading title+lede
// resolves easily. Powered by GPT-5 via the Lovable AI gateway.

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") || "";
const LOVABLE_API_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

export interface NewsCandidate {
  url: string;
  title: string;
  /** Title-adjacent text: SERP snippet, summary, or first ~800 chars of scraped body. */
  content: string;
  detectedCompetitor: string;
  /** Optional deterministic genre hint from news-queue classifier. */
  genreHint?: string;
}

export interface NewsQualityScores {
  subjecthood: number;
  genre_fit: number;
  substance: number;
  independence: number;
  total: number;
}

export interface ScoredNewsItem extends NewsCandidate {
  scores: NewsQualityScores;
}

const SYSTEM_PROMPT = `You are a STRICT final quality gate for FP&A/EPM competitor NEWS intelligence. Tracked competitors: Anaplan, Planful, Vena Solutions, Pigment, Datarails, Jedox, Board International, OneStream, Prophix, Workiva, Oracle EPM, SAP Analytics Cloud, IBM Planning Analytics, Wolters Kluwer CCH Tagetik, Workday Adaptive Planning.

You judge whether each item is a SUBSTANTIVE PRODUCT/STRATEGIC NEWS STORY about a tracked competitor. Score 0-10 on EXACTLY four dimensions. Be ruthless. When in doubt, score LOW.

1. SUBJECTHOOD — Is the tracked competitor the actual SUBJECT of this article (named in the title, the lede, or repeatedly in the body)?
   0 if the competitor name only appears in a navigation menu, breadcrumb, "tagged in" sidebar, footer, "related products" list, or alphabetical product directory.
   0 if the page is a generic listicle, a "Top 10 FP&A tools" roundup, or a topic-aggregator landing page where the competitor is one of many.

2. GENRE_FIT — Is this a PRODUCT or STRATEGIC NEWS story (launch, GA, release, new feature/module, partnership, M&A, pricing change, leadership change tied to product strategy, IPO, rebrand)?
   0 for earnings calls, earnings-call transcripts, EPS beats/misses, "expected to announce quarterly earnings", stock price targets, analyst price upgrades, dividend/buyback news.
   0 for commissioned surveys, "survey of N executives", new study/research reports.
   0 for awards self-celebration, recruiter posts, training course ads, conference booth invites, generic thought-leadership.

3. SUBSTANCE — Does the piece actually report a SPECIFIC, VERIFIABLE thing about that competitor (a product feature, a deal, a date, a number)?
   0 for passing one-line mentions inside a roundup.
   0 for marketing fluff with no concrete claim.

4. INDEPENDENCE — Is this independent reporting OR a primary press release we'd cite as a source?
   0 for forum threads, KB articles, help-center pages, community category landing pages (e.g. SAP Community pd-p/ pages, Oracle Communities discussion threads).
   0 for publication HOMEPAGES or topic-aggregator URLs (e.g. cio.com/article/<id>/sap-latest-news-and-insights, itupdate.id/, generic /tag/ or /topic/ pages).

Respond with ONLY a JSON object of this exact shape:
{"scores":[{"idx":0,"subjecthood":7,"genre_fit":8,"substance":7,"independence":9}, ...]}
One entry per item, in order, all four numbers 0-10.`;

async function scoreBatch(items: NewsCandidate[]): Promise<ScoredNewsItem[]> {
  const itemsSummary = items.map((it, idx) => (
    `[${idx}] URL: ${it.url}\nTitle: ${it.title}\nCompetitor: ${it.detectedCompetitor}\nDeterministicGenre: ${it.genreHint || "unknown"}\nContent: ${(it.content || "").slice(0, 800)}`
  )).join("\n---\n");

  try {
    const res = await fetch(LOVABLE_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-5.5",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `Score these ${items.length} news candidates:\n\n${itemsSummary}` },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      console.error(`[news-quality-gate] AI error ${res.status}: ${(await res.text()).slice(0, 300)}`);
      return [];
    }

    const data = await res.json();
    const raw = data.choices?.[0]?.message?.content || "";

    let scores: any[] = [];
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) scores = parsed;
      else if (Array.isArray(parsed?.scores)) scores = parsed.scores;
      else if (Array.isArray(parsed?.items)) scores = parsed.items;
      else if (Array.isArray(parsed?.results)) scores = parsed.results;
    } catch {
      const m = raw.match(/\[[\s\S]*\]/);
      if (m) { try { scores = JSON.parse(m[0]); } catch { /* noop */ } }
    }
    if (!scores.length) {
      console.error(`[news-quality-gate] Could not parse scores. Raw: ${raw.slice(0, 500)}`);
      return [];
    }

    return items.map((it, idx) => {
      const s = scores.find((x: any) => x.idx === idx) || scores[idx] || {};
      const subjecthood = Math.min(10, Math.max(0, Number(s.subjecthood) || 0));
      const genre_fit = Math.min(10, Math.max(0, Number(s.genre_fit ?? s.genre) || 0));
      const substance = Math.min(10, Math.max(0, Number(s.substance) || 0));
      const independence = Math.min(10, Math.max(0, Number(s.independence) || 0));
      return {
        ...it,
        scores: {
          subjecthood, genre_fit, substance, independence,
          total: subjecthood + genre_fit + substance + independence,
        },
      };
    });
  } catch (e) {
    console.error(`[news-quality-gate] Batch error: ${(e as Error).message}`);
    return [];
  }
}

export interface NewsGateOptions {
  /** Minimum total (out of 40). Default 24. */
  threshold?: number;
  /** Minimum subjecthood (0-10). Default 6. */
  minSubjecthood?: number;
  /** Minimum genre_fit (0-10). Default 6. */
  minGenreFit?: number;
  batchSize?: number;
}

export interface NewsGateResult {
  scored: ScoredNewsItem[];
  passing: ScoredNewsItem[];
  /** True when the LLM call returned no scores at all — caller should fall back to deterministic verdict. */
  llmUnavailable: boolean;
}

/**
 * Final quality gate for news. Run AFTER the deterministic news-queue
 * filters reject the easy noise. Items below threshold are dropped;
 * items above threshold are returned in `passing` (deduped/sorted).
 *
 * On LLM failure (no key, 429, 402, parse error) returns `llmUnavailable=true`
 * and `passing = items unchanged` so the pipeline keeps producing.
 */
export async function gateNewsItems(
  items: NewsCandidate[],
  opts: NewsGateOptions = {},
): Promise<NewsGateResult> {
  if (items.length === 0) return { scored: [], passing: [], llmUnavailable: false };

  const threshold = opts.threshold ?? 24;
  const minSubjecthood = opts.minSubjecthood ?? 6;
  const minGenreFit = opts.minGenreFit ?? 6;
  const BATCH_SIZE = opts.batchSize ?? 20;

  const scored: ScoredNewsItem[] = [];
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    console.log(`[news-quality-gate] Scoring batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(items.length / BATCH_SIZE)} (${batch.length})`);
    const result = await scoreBatch(batch);
    scored.push(...result);
    if (i + BATCH_SIZE < items.length) await new Promise((r) => setTimeout(r, 1000));
  }

  if (scored.length === 0) {
    // LLM unavailable — fall back to passing everything as-is so deterministic
    // filtering remains the source of truth and the pipeline doesn't stall.
    console.warn(`[news-quality-gate] LLM unavailable, falling back to deterministic verdict for ${items.length} items`);
    return {
      scored: [],
      passing: items.map((it) => ({ ...it, scores: { subjecthood: 0, genre_fit: 0, substance: 0, independence: 0, total: 0 } })),
      llmUnavailable: true,
    };
  }

  const passing = scored.filter((s) =>
    s.scores.total >= threshold &&
    s.scores.subjecthood >= minSubjecthood &&
    s.scores.genre_fit >= minGenreFit
  );

  const breakdown = {
    scored: scored.length,
    passed: passing.length,
    rejected_low_total: scored.filter((s) => s.scores.total < threshold).length,
    rejected_low_subjecthood: scored.filter((s) => s.scores.subjecthood < minSubjecthood).length,
    rejected_low_genre: scored.filter((s) => s.scores.genre_fit < minGenreFit).length,
  };
  console.log(`[news-quality-gate] ${JSON.stringify(breakdown)}`);

  return { scored, passing, llmUnavailable: false };
}
