// Reddit quality scoring — thin wrapper around the UNIVERSAL community
// quality gate so Reddit and LinkedIn share the same strict standard.
import {
  gateCommunityItems,
  type CommunityItem,
  type ScoredCommunityItem,
} from "./community-quality-scorer.ts";

export interface RedditItem {
  url: string;
  title: string;
  content: string;
  estimatedDate: string | null;
  detectedCompetitor: string;
}

export type ScoredItem = ScoredCommunityItem;

export async function gateRedditItems(
  items: RedditItem[],
  opts: { threshold?: number; count?: number; batchSize?: number } = {},
): Promise<{ scored: ScoredItem[]; passing: ScoredItem[] }> {
  const tagged: CommunityItem[] = items.map((i) => ({ ...i, source: "reddit" as const }));
  return await gateCommunityItems(tagged, opts);
}
