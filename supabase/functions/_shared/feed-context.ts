// feed-context.ts — bridges Feed Agent's `news_items` table into Comp Agent context.
//
// Reuses the daily-cron-curated news + community items so Comp Agent can answer
// "what's the latest on X?" / "what are users saying about X?" without firing
// fresh Firecrawl calls. Items are pre-deduped and quality-gated upstream.

export interface FeedItem {
  id: string;
  item_type: string;
  source_name: string | null;
  title: string;
  summary: string | null;
  source_url: string;
  published_at: string | null;
}

export interface FeedEvidence {
  newsBlock: string;
  communityBlock: string;
  newsItems: FeedItem[];
  communityItems: FeedItem[];
  urls: string[];
}

const EMPTY: FeedEvidence = {
  newsBlock: "",
  communityBlock: "",
  newsItems: [],
  communityItems: [],
  urls: [],
};

// No cap — the agent should see every available feed item for a competitor.
const MAX_BLOCK_CHARS = Number.POSITIVE_INFINITY;

function fmtDate(iso: string | null): string {
  if (!iso) return "undated";
  try {
    return new Date(iso).toISOString().slice(0, 10);
  } catch { return "undated"; }
}

function formatItem(it: FeedItem, opts: { includeDate: boolean }): string {
  const competitor = it.source_name ? it.source_name.trim() : "Unknown";
  const summary = (it.summary || "").trim().replace(/\s+/g, " ").slice(0, 240);
  const datePrefix = opts.includeDate ? `[${fmtDate(it.published_at)}] ` : "";
  // Always tag the competitor explicitly so the model can pick the right item.
  const head = `- ${datePrefix}(${competitor}) ${it.title} — ${it.source_url}`;
  return summary ? `${head}\n  ${summary}` : head;
}

function buildBlock(heading: string, items: FeedItem[], includeDate: boolean): string {
  if (items.length === 0) return "";
  const lines = [`## ${heading}`];
  let used = lines[0].length;
  for (const it of items) {
    const line = formatItem(it, { includeDate });
    if (used + line.length + 2 > MAX_BLOCK_CHARS) break;
    lines.push(line);
    used += line.length + 2;
  }
  return lines.join("\n");
}

export interface FetchOpts {
  includeCommunity?: boolean; // default true; set false when intent.asksCommunity is false
}

/**
 * Fetch ALL curated feed items (news + optionally community) for the given
 * competitor names. No date or count cap — the agent gets the full pool so it
 * can pick whichever items match the user's prompt.
 */
export async function fetchFeedEvidenceForCompetitors(
  supabase: any,
  competitors: string[],
  opts: FetchOpts = {},
): Promise<FeedEvidence> {
  const names = (competitors || []).filter((n) => typeof n === "string" && n.trim().length > 0);
  if (names.length === 0) return EMPTY;

  const includeCommunity = opts.includeCommunity !== false;

  try {
    // Case-insensitive match against source_name (Feed Agent stores competitor
    // name there). Uses PostgREST `or=` chain.
    const ors = names
      .map((n) => `source_name.ilike.${n.replace(/[,()]/g, "")}`)
      .join(",");

    // Fetch every matching item; rely on news_items being pre-deduped/quality-gated upstream.
    // Supabase default cap is 1000 rows — set explicit high ceiling for safety.
    const { data, error } = await supabase
      .from("news_items")
      .select("id,item_type,source_name,title,summary,source_url,published_at")
      .or(ors)
      .order("published_at", { ascending: false, nullsFirst: false })
      .limit(5000);

    if (error) {
      console.error("fetchFeedEvidenceForCompetitors error:", error);
      return EMPTY;
    }

    const rows = (data || []) as FeedItem[];
    const news: FeedItem[] = [];
    const community: FeedItem[] = [];
    for (const r of rows) {
      if (r.item_type === "news") news.push(r);
      else if (r.item_type === "community" && includeCommunity) community.push(r);
    }

    const newsBlock = buildBlock("FEED-CURATED NEWS (full history)", news, true);
    const communityBlock = includeCommunity
      ? buildBlock("COMMUNITY SIGNALS (date-agnostic, full history)", community, false)
      : "";

    const urls = [
      ...news.map((n) => n.source_url),
      ...(includeCommunity ? community.map((c) => c.source_url) : []),
    ].filter((u): u is string => typeof u === "string" && u.startsWith("http"));

    return {
      newsBlock,
      communityBlock,
      newsItems: news,
      communityItems: includeCommunity ? community : [],
      urls,
    };
  } catch (e) {
    console.error("fetchFeedEvidenceForCompetitors threw:", e);
    return EMPTY;
  }
}
