// LinkedIn quality scoring — thin wrapper around the UNIVERSAL community
// quality gate so Reddit and LinkedIn share the same strict standard.
import {
  gateCommunityItems,
  type CommunityItem,
  type ScoredCommunityItem,
} from "./community-quality-scorer.ts";

export interface LinkedInItem {
  url: string;
  title: string;
  content: string;
  estimatedDate: string | null;
  detectedCompetitor: string;
}

export type ScoredLinkedInItem = ScoredCommunityItem;

export async function gateLinkedInItems(
  items: LinkedInItem[],
  opts: { threshold?: number; count?: number; batchSize?: number } = {},
): Promise<{ scored: ScoredLinkedInItem[]; passing: ScoredLinkedInItem[] }> {
  const tagged: CommunityItem[] = items.map((i) => ({ ...i, source: "linkedin" as const }));
  return await gateCommunityItems(tagged, opts);
}
