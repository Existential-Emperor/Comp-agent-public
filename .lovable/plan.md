

## Prioritize Crunchbase and Gartner as Core Data Sources

### What Changes

Both the **discover-competitors** and **chat-analysis** backend functions will be updated to run a two-phase search strategy:

1. **Phase 1 (Priority):** Search Crunchbase and Gartner specifically using Tavily's `include_domains` filter
2. **Phase 2 (Broad):** Search the open web for additional results (existing behavior)

Results from both phases are merged, with Crunchbase/Gartner results placed first so the AI model treats them as higher-priority data.

### Changes by File

#### 1. `supabase/functions/discover-competitors/index.ts`

- Add a **priority search phase** with 2 queries targeting `include_domains: ["crunchbase.com", "gartner.com"]`
  - e.g. `"competitors of Workday Adaptive Planning {subCategory} site:crunchbase.com OR site:gartner.com"`
- Keep the existing 3 broad queries as Phase 2 (unchanged)
- Merge results: priority results first, then broad results
- The AI extraction prompt will note that Crunchbase/Gartner sources should be weighted higher

#### 2. `supabase/functions/chat-analysis/index.ts` (gatherIntelligence function)

- Add a **priority search pass** with queries filtered to `include_domains: ["crunchbase.com", "gartner.com"]`
  - e.g. `"{competitor} {subCategory} profile"` scoped to Crunchbase/Gartner
- Run existing broad queries as Phase 2 (unchanged)
- Prepend priority results to the intelligence array so the summarizer sees them first

### What Stays the Same

- All existing broad web searches remain untouched
- No UI changes
- No database changes
- No new secrets needed (uses existing Tavily key)
- The Tavily search endpoint and all other logic remain identical

### Technical Details

**Priority domains list:**
```
["crunchbase.com", "gartner.com"]
```

**Example priority queries (discover-competitors):**
```
"{subCategory} software companies competing with Adaptive Planning site:crunchbase.com"
"{subCategory} enterprise software vendors Gartner Magic Quadrant"
```

**Example priority queries (chat-analysis):**
```
"{competitor} company profile funding {subCategory}"  (scoped to crunchbase.com, gartner.com)
"{competitor} Gartner review {subCategory} software"  (scoped to crunchbase.com, gartner.com)
```

Results from priority searches are placed before broad results in the array, ensuring the AI model gives them higher weight during extraction and summarization.

