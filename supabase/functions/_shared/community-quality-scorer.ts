// Universal community quality scorer. Used by BOTH Reddit and LinkedIn
// (and any future community sources) so the entire community section
// shares the SAME strict standard: only independent practitioner/user
// content about competitors or Workday Adaptive Planning passes the gate.
//
// Powered by GPT-5 via the Lovable AI gateway.

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") || "";
const LOVABLE_API_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

export type CommunitySource = "reddit" | "linkedin" | "other";

export interface CommunityItem {
  url: string;
  title: string;
  content: string;
  estimatedDate: string | null;
  detectedCompetitor: string;
  source?: CommunitySource;
}

export interface CommunityItemScores {
  relevance: number;
  depth: number;
  recency: number;
  sentiment: number;
  total: number;
}

export interface ScoredCommunityItem extends CommunityItem {
  scores: CommunityItemScores;
}

const SYSTEM_PROMPT = `You are a STRICT, universal quality gate for FP&A/EPM competitor intelligence in the COMMUNITY section. Source platforms include Reddit, LinkedIn, and similar community sites. The goal is to keep ONLY independent user/practitioner/customer content ABOUT competitors or Workday Adaptive Planning — NEVER content authored or amplified by the vendors themselves.

HARD REJECT (assign relevance=0, depth=0, sentiment=0) if ANY of the following is true:
- The author/page is the vendor itself or one of its employees, executives, founders, partners, resellers, recruiters, or official "ambassadors"/"MVPs" promoting their own product (e.g. an Anaplan post about Anaplan, a Pigment employee promoting Pigment, an OneStream MVP reposting OneStream marketing, a Planful customer-success rep, a Vena partner pushing Vena).
- It is a vendor announcement, product launch, "thrilled to announce", "we're hiring", conference booth promotion, webinar invite, award/recognition self-celebration, or partner certification news.
- It is a recruiter/job post, course/training advertisement, paid promotion, or generic thought-leadership with no specific competitor product discussion.
- It is a press release, analyst-report republication, or pure marketing copy.
- It is a generic listicle ("Top 10 FP&A tools") with no real practitioner perspective.

ACCEPT only if the post is an INDEPENDENT user/practitioner/customer perspective: real implementation experience, candid comparison, complaint, praise from a real user, RFP/selection lessons-learned, migration story, independent consultant review (NOT employed by or a partner of the vendor), or community Q&A about the product.

Score each item on 4 dimensions (0-10 each):
1. RELEVANCE: Does an independent practitioner discuss a specific FP&A/EPM competitor (Anaplan, Planful, Pigment, OneStream, Vena, Datarails, Jedox, Board, Prophix, Workiva, Oracle EPM, SAP Analytics Cloud, IBM Planning Analytics, CCH Tagetik) or Workday Adaptive Planning? 0 if vendor-authored or no specific product.
2. DEPTH: Substantive practitioner detail, implementation specifics, candid comparison, or customer story. 0 for marketing fluff or one-liner mentions.
3. RECENCY: References recent releases, versions, conferences, or events. Higher for time-specific content.
4. SENTIMENT_RICHNESS: Real user opinion — praise, complaints, comparisons, recommendations from independent voices. 0 for vendor self-promotion.

Be ruthless. When in doubt about whether the author is the vendor, REJECT (score 0).

Respond with ONLY a JSON object of this exact shape: {"scores": [{"idx":0,"relevance":7,"depth":8,"recency":5,"sentiment":6}, ...]} — one entry per item, in order.`;

async function scoreBatch(items: CommunityItem[]): Promise<ScoredCommunityItem[]> {
  const itemsSummary = items.map((item, idx) => (
    `[${idx}] SOURCE: ${item.source || "community"}\nURL: ${item.url}\nTitle: ${item.title}\nCompetitor: ${item.detectedCompetitor}\nDate: ${item.estimatedDate || "unknown"}\nContent: ${item.content.slice(0, 600)}\n`
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
          { role: "user", content: `Score these ${items.length} community posts:\n\n${itemsSummary}` },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      console.error(`[community-quality-gate] AI error ${res.status}: ${(await res.text()).slice(0, 300)}`);
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
      else if (parsed && typeof parsed === "object") {
        const keys = Object.keys(parsed).filter((k) => /^\d+$/.test(k));
        if (keys.length) scores = keys.sort((a, b) => Number(a) - Number(b)).map((k) => ({ idx: Number(k), ...parsed[k] }));
      }
    } catch {
      const match = raw.match(/\[[\s\S]*\]/);
      if (match) { try { scores = JSON.parse(match[0]); } catch { /* noop */ } }
    }
    if (!scores.length) {
      console.error(`[community-quality-gate] Could not parse scores. Raw (first 500 chars): ${raw.slice(0, 500)}`);
      return [];
    }

    return items.map((item, idx) => {
      const s = scores.find((x: any) => x.idx === idx) || scores[idx] || {};
      const relevance = Math.min(10, Math.max(0, Number(s.relevance) || 0));
      const depth = Math.min(10, Math.max(0, Number(s.depth) || 0));
      const recency = Math.min(10, Math.max(0, Number(s.recency) || 0));
      const sentiment = Math.min(10, Math.max(0, Number(s.sentiment || s.sentiment_richness) || 0));
      return {
        ...item,
        scores: { relevance, depth, recency, sentiment, total: relevance + depth + recency + sentiment },
      };
    });
  } catch (e) {
    console.error(`[community-quality-gate] Batch error: ${(e as Error).message}`);
    return [];
  }
}

/**
 * UNIVERSAL community quality gate. Same standard for Reddit, LinkedIn,
 * and any future community source. Returns items with combined score
 * >= threshold (default 20/40), sorted descending, capped at `count`.
 */
export async function gateCommunityItems(
  items: CommunityItem[],
  opts: { threshold?: number; count?: number; batchSize?: number } = {},
): Promise<{ scored: ScoredCommunityItem[]; passing: ScoredCommunityItem[] }> {
  const threshold = opts.threshold ?? 20;
  const count = opts.count ?? items.length;
  const BATCH_SIZE = opts.batchSize ?? 20;

  const allScored: ScoredCommunityItem[] = [];
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    console.log(`[community-quality-gate] Scoring batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(items.length / BATCH_SIZE)} (${batch.length} items)`);
    const scored = await scoreBatch(batch);
    allScored.push(...scored);
    if (i + BATCH_SIZE < items.length) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  const passing = allScored
    .filter((item) => item.scores.total >= threshold)
    .sort((a, b) => b.scores.total - a.scores.total)
    .slice(0, count);

  return { scored: allScored, passing };
}
