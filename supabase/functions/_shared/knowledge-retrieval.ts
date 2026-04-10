/**
 * Retrieves relevant knowledge chunks based on the analysis context.
 * Uses tag-based matching with scoring to return only the most relevant chunks.
 */

import { KNOWLEDGE_CHUNKS, type KnowledgeChunk } from "./knowledge-chunks.ts";

interface RetrievalContext {
  category: string;
  subCategory: string;
  competitor?: string;
  /** Optional additional query text (e.g., user follow-up question) */
  query?: string;
}

/**
 * Retrieve relevant knowledge chunks for a given analysis context.
 * Returns chunks sorted by relevance score, limited to maxChunks.
 */
export function retrieveKnowledge(
  ctx: RetrievalContext,
  maxChunks = 8
): { chunks: KnowledgeChunk[]; context: string } {
  const isFullProduct = ctx.category === "Full Product" && ctx.subCategory === "Full Product";

  // Build search terms from the context
  const searchTerms = buildSearchTerms(ctx);

  // Score each chunk
  const scored = KNOWLEDGE_CHUNKS.map((chunk) => ({
    chunk,
    score: scoreChunk(chunk, searchTerms, isFullProduct),
  }));

  // Filter chunks with score > 0, sort by score descending, take top N
  const relevant = scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxChunks);

  // Format into injectable context
  const context = relevant.length > 0
    ? relevant
        .map((s) => `### ${s.chunk.title}\n${s.chunk.content}`)
        .join("\n\n")
    : "";

  return {
    chunks: relevant.map((s) => s.chunk),
    context,
  };
}

/**
 * Build normalized search terms from the analysis context.
 */
function buildSearchTerms(ctx: RetrievalContext): string[] {
  const terms: string[] = [];

  // Add category and subcategory as terms
  if (ctx.category) terms.push(ctx.category.toLowerCase());
  if (ctx.subCategory) terms.push(ctx.subCategory.toLowerCase());

  // Map category names to relevant tags
  const categoryTagMap: Record<string, string[]> = {
    "reporting & analytics": ["reporting", "analytics", "dashboards", "visualization"],
    "modeling & architecture": ["modeling", "architecture", "formulas", "dimensions"],
    "intelligent planning": ["intelligent planning", "ai", "ml", "forecasting"],
    "integration": ["integration", "data integration", "drill-through", "connectors"],
    "collaboration & workflow": ["collaboration", "workflow", "approvals", "audit trail"],
    "specialized planning modules": ["specialized", "workforce planning", "sales planning", "consolidation"],
    "full product": ["full product"],
  };

  const catKey = ctx.category.toLowerCase();
  if (categoryTagMap[catKey]) {
    terms.push(...categoryTagMap[catKey]);
  }

  // Map subcategory to specific tags
  const subCatTagMap: Record<string, string[]> = {
    "web-based matrix reporting": ["matrix reporting", "reporting", "reports"],
    "officeconnect": ["officeconnect", "excel", "word", "powerpoint"],
    "workday for google sheets": ["google sheets"],
    "dashboards & visualization": ["dashboards", "visualization", "interactive"],
    "ad-hoc analysis": ["ad-hoc analysis", "cell explorer", "drill-down"],
    "elastic hypercube technology": ["elastic hypercube", "calculation engine", "scalability"],
    "standard sheets": ["standard sheets", "data entry"],
    "cube sheets": ["cube sheets", "multidimensional"],
    "modeled sheets": ["modeled sheets", "personnel", "records"],
    "dimensions & attributes": ["dimensions", "attributes"],
    "predictive forecaster": ["predictive forecaster", "forecasting", "ml"],
    "anomaly detection": ["anomaly detection", "data quality"],
    "planning agent": ["planning agent", "conversational", "variance analysis"],
    "data integration": ["data integration", "connectors", "import", "etl"],
    "drill-through": ["drill-through", "source systems"],
    "process tracker": ["process tracker", "task management"],
    "workflow": ["workflow", "approvals", "locking"],
    "cell notes & audit trail": ["cell notes", "audit trail", "compliance"],
    "workforce planning": ["workforce planning", "hcm", "headcount", "personnel"],
    "sales planning": ["sales planning", "territory", "quota"],
    "consolidation": ["consolidation", "financial close", "intercompany", "currency"],
  };

  const subKey = ctx.subCategory.toLowerCase();
  if (subCatTagMap[subKey]) {
    terms.push(...subCatTagMap[subKey]);
  }

  // Extract keywords from query if provided
  if (ctx.query) {
    const queryWords = ctx.query.toLowerCase()
      .replace(/[^a-z0-9\s-]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3);
    terms.push(...queryWords);
  }

  return [...new Set(terms)];
}

/**
 * Score a chunk based on how many search terms match its tags.
 */
function scoreChunk(
  chunk: KnowledgeChunk,
  searchTerms: string[],
  isFullProduct: boolean
): number {
  let score = 0;
  const lowerTags = chunk.tags.map((t) => t.toLowerCase());

  // For full product, include all chunks tagged with "full product"
  if (isFullProduct) {
    if (lowerTags.includes("full product")) {
      score += 1; // Base score for full-product chunks
    } else {
      return 0; // Skip chunks not tagged for full product
    }
  }

  // Score by tag matches
  for (const term of searchTerms) {
    for (const tag of lowerTags) {
      if (tag === term) {
        score += 3; // Exact match
      } else if (tag.includes(term) || term.includes(tag)) {
        score += 1; // Partial match
      }
    }
  }

  return score;
}
