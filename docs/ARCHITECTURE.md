# Comp Intelligence Agent — Architecture & Documentation

## Table of Contents
1. [Overview](#overview)
2. [Frontend Components](#frontend-components)
3. [Pages](#pages)
4. [Hooks](#hooks)
5. [Libraries & Utilities](#libraries--utilities)
6. [Backend Functions](#backend-functions)
7. [System Prompts](#system-prompts)
8. [Database Tables](#database-tables)
9. [Data Taxonomy](#data-taxonomy)

---

## Overview

The Comp Intelligence Agent is an AI-powered competitive analysis tool for Workday Adaptive Planning. Users select a **Charter** (category), **Product Area** (sub-category), and **Competitor**, then the system generates a structured competitive analysis using a multi-phase research pipeline (Claude web search → Firecrawl scraping → Gemini synthesis).

**Tech Stack:** React + TypeScript + Vite + Tailwind CSS + Supabase (Lovable Cloud)

---

## Frontend Components

### `ChatInterface.tsx`
**Purpose:** Main chat UI with embedded filter dropdowns and message rendering.

| Prop | Type | Description |
|------|------|-------------|
| `messages` | `Message[]` | Conversation messages to display |
| `loading` | `boolean` | Shows loading spinner with "Analyzing competitive landscape..." |
| `onSendMessage` | `(content: string) => void` | Sends a follow-up message |
| `onFeedback` | `(messageId, feedback) => void` | Thumbs up/down on assistant responses |
| `onStop` | `() => void` | Aborts an in-flight analysis request |
| `category` | `string` | Selected charter |
| `subCategory` | `string` | Selected product area |
| `competitor` | `string` | Selected competitor |
| `competitors` | `array` | Merged list of seed + discovered competitors |
| `onCategoryChange/onSubCategoryChange/onCompetitorChange` | `(v: string) => void` | Filter change handlers |
| `refreshing` | `boolean` | Shows "Discovering competitors..." indicator |
| `onLetsGo` | `() => void` | Triggers initial analysis |

**Key behaviors:**
- Dropdowns are disabled once a chat has started (prevents context switching mid-analysis)
- "Let's Go!" button appears before first message, text input appears after
- Auto-scrolls to bottom on new messages
- Copy-to-clipboard on assistant messages

---

### `ChatSidebar.tsx`
**Purpose:** Left sidebar showing conversation thread history.

| Prop | Type | Description |
|------|------|-------------|
| `threads` | `Thread[]` | List of non-archived chat threads |
| `activeThreadId` | `string \| null` | Currently selected thread |
| `onSelectThread` | `(id: string) => void` | Switch to a thread |
| `onNewThread` | `() => void` | Start a new chat |
| `onDeleteThread` | `(id: string) => void` | Archive a thread |
| `deletingThreadId` | `string \| null` | Shows spinner on deleting thread |

**Key behaviors:**
- "New Chat" entry at top, always visible
- Each thread shows title + sub-category
- Delete button appears on hover
- Deletion archives the thread (soft delete) with a conversation summary

---

### `FilterBar.tsx`
**Purpose:** Standalone filter bar component (currently unused — filters are embedded in `ChatInterface`).

Renders three `<Select>` dropdowns (Category → Sub-Category → Competitor) plus a "Refresh Competition" button. Uses seed data from `seed-data.ts`.

---

### `FormattedResponse.tsx`
**Purpose:** Parses raw markdown-like AI responses into structured JSX.

**Parser capabilities:**
- `## Headings` → styled heading divs (4 levels)
- `| table |` → shadcn `<Table>` components
- `- list items` → styled bullet lists with dot indicators
- Paragraphs → `<p>` tags
- URLs → clickable `<a>` links (auto-detected, truncated if >50 chars)
- Strips markdown bold/italic/code markers for clean display

**Internal functions:**
- `parseBlocks(raw)` — Splits raw text into typed `Block[]` (heading, table, list, paragraph)
- `parseTable(lines)` — Extracts headers & rows from pipe-delimited table lines
- `cleanInline(text)` — Removes `**bold**`, `*italic*`, `` `code` `` markers
- `linkify(text)` — Converts URLs to `<a>` elements

---

### `NavLink.tsx`
**Purpose:** Wrapper around React Router's `NavLink` with `cn()` className merging support. Adds `activeClassName` and `pendingClassName` props.

---

## Pages

### `Auth.tsx`
**Purpose:** Authentication page with three views: Login, Sign Up, Forgot Password.

**Features:**
- Email/password authentication via Supabase Auth
- "Remember Me" saves email to localStorage (never passwords)
- Password confirmation on signup
- Forgot password sends reset link via `supabase.auth.resetPasswordForEmail`
- Redirects to `/reset-password` for token-based password reset

---

### `Dashboard.tsx`
**Purpose:** Main application page — orchestrates the entire analysis workflow.

**State management:**
- Category/SubCategory/Competitor selection
- Thread CRUD (create, load, archive/delete)
- Message loading and sending
- Competitor discovery (auto-triggered on sub-category change)
- Evaluation scores from LLM-as-Judge
- AbortController for cancelling in-flight requests

**Key flows:**
1. **Competitor Discovery:** When sub-category changes → calls `discover-competitors` edge function → merges results with seed data
2. **"Let's Go!":** Creates a new thread with auto-numbered title (e.g., "Anaplan", "Anaplan 2") → sends initial analysis request
3. **Follow-up Messages:** Sends full conversation history to `chat-analysis` for context-aware responses
4. **Feedback:** Thumbs up/down stores validated responses in `validated_responses` table
5. **Thread Deletion:** Archives thread with conversation summary, doesn't hard-delete

---

### `ResetPassword.tsx`
**Purpose:** Password reset form shown after clicking email reset link.

Listens for `PASSWORD_RECOVERY` auth event or `type=recovery` hash, then allows setting a new password via `supabase.auth.updateUser`.

---

### `Index.tsx`
**Purpose:** Fallback landing page (unused — root route loads Dashboard).

---

### `NotFound.tsx`
**Purpose:** 404 page.

---

## Hooks

### `useAuth.tsx`
**Purpose:** Authentication context provider.

**Provides:**
- `session` — Current Supabase session
- `user` — Current user object
- `loading` — Auth state loading
- `signUp(email, password)` — Create account
- `signIn(email, password)` — Email/password login
- `signOut()` — Logout

---

## Libraries & Utilities

### `src/lib/seed-data.ts`
**Purpose:** Static taxonomy and seed competitor data.

**Exports:**
- `categories: CategoryData[]` — Full taxonomy tree
- `getCategoryNames()` — Returns charter names
- `getSubCategories(categoryName)` — Returns product areas for a charter
- `getSeedCompetitors(category, subCategory)` — Returns seed competitors

### `src/lib/api/firecrawl.ts`
**Purpose:** Client-side API wrapper for edge functions.

- `firecrawlApi.scrape(url, options)` — Invokes `firecrawl-scrape` edge function
- `tavilyApi.search(query, options)` — Invokes `tavily-search` edge function

---

## Backend Functions

### `discover-competitors/index.ts`
**Purpose:** Discovers competitors for a given product area using AI web search.

**Flow:**
1. Authenticate user via JWT
2. **Phase 1:** Claude web search on Crunchbase + Gartner for priority results
3. **Phase 2:** Claude web search for broad competitor landscape
4. **Extraction:** Gemini 2.5 Flash extracts structured JSON from search results (max 10 competitors)
5. **Fallback:** If Claude unavailable, uses direct Gemini generation
6. **Storage:** Upserts new competitors to `competitors` table (deduplicates by name + sub_category)

**API Keys Used:** `ANTHROPIC_API_KEY`, `LOVABLE_API_KEY`

---

### `chat-analysis/index.ts`
**Purpose:** Generates competitive analysis responses with multi-source intelligence.

**Flow:**
1. Authenticate user via JWT
2. **Smart Routing:** For follow-ups, classifies if fresh web research is needed or context suffices
3. **Intelligence Gathering:** Claude web search (priority: Crunchbase/Gartner + broad) + Firecrawl scraping of competitor website
4. **Summarization:** Gemini Flash Lite summarizes raw intel into a brief
5. **Analysis Generation:** Gemini 2.5 Flash generates structured competitive analysis
6. **Evaluation:** LLM-as-Judge scores the response on 5 criteria
7. Returns `{ content, evalScores }`

**API Keys Used:** `ANTHROPIC_API_KEY`, `FIRECRAWL_API_KEY`, `LOVABLE_API_KEY`

---

### `firecrawl-scrape/index.ts`
**Purpose:** Proxy for Firecrawl web scraping API. Accepts a URL, returns scraped markdown content.

**API Keys Used:** `FIRECRAWL_API_KEY`

---

### `tavily-search/index.ts`
**Purpose:** Proxy for Claude web search (originally Tavily, now uses Anthropic API). Accepts a query, returns search results with answer text.

**API Keys Used:** `ANTHROPIC_API_KEY`

---

## System Prompts

### 1. Competitor Discovery — Extraction Prompt
**Used in:** `discover-competitors/index.ts` (line 111)
**Model:** Gemini 2.5 Flash
**Purpose:** Extract structured competitor JSON from raw web search results

```
Based on the following search results about software competing with Workday Adaptive Planning 
in "{subCategory}" ({category}), extract a list of competitor companies.

Results marked [Priority Source] come from Crunchbase and Gartner — give these higher weight 
for accuracy and completeness.

Search results:
{allResults joined}

Return a JSON array of objects with: name, website, description (one sentence).
Return ONLY the JSON array, no other text. Maximum 10 competitors.
Exclude Workday/Adaptive Planning itself.
```

---

### 2. Competitor Discovery — Fallback Prompt
**Used in:** `discover-competitors/index.ts` (line 148)
**Model:** Gemini 2.5 Flash
**Purpose:** Direct AI generation of competitors when Claude web search is unavailable

```
List software companies that compete with Workday Adaptive Planning specifically in the 
"{subCategory}" capability area ({category}). 
Search across ALL software categories, not just FP&A/EPM. Include companies from BI, 
data analytics, workflow automation, and any other relevant categories.
Return a JSON array of objects with: name, website, description (one sentence).
Return ONLY the JSON array, no other text. Maximum 10 competitors.
```

---

### 3. Claude Web Search — Competitor Discovery (Priority)
**Used in:** `discover-competitors/index.ts` (line 93)
**Model:** Claude Sonnet 4 (with web_search tool)
**Purpose:** Priority search on Crunchbase and Gartner

```
Search crunchbase.com and gartner.com for software companies competing with Workday Adaptive 
Planning in {subCategory} ({category}). Find Gartner Magic Quadrant leaders and Crunchbase 
company profiles in this space.
```

---

### 4. Claude Web Search — Competitor Discovery (Broad)
**Used in:** `discover-competitors/index.ts` (line 102)
**Model:** Claude Sonnet 4 (with web_search tool)
**Purpose:** Broad web search for competitor landscape

```
Find all major software companies that compete with Workday Adaptive Planning specifically in 
{subCategory} ({category}). Include companies from FP&A, EPM, BI, data analytics, and workflow 
automation categories. List their names, websites, and what they do. Focus on 2025 market landscape.
```

---

### 5. Claude Web Search — Intelligence Gathering (Priority)
**Used in:** `chat-analysis/index.ts` (line 63)
**Model:** Claude Sonnet 4 (with web_search tool, max 3 uses)
**Purpose:** Targeted search on Crunchbase and Gartner for a specific competitor

```
Search specifically on crunchbase.com and gartner.com for information about "{competitor}" in 
the {subCategory} software category. Find company profile, funding details, and analyst reviews.
```

---

### 6. Claude Web Search — Intelligence Gathering (Broad)
**Used in:** `chat-analysis/index.ts` (line 72)
**Model:** Claude Sonnet 4 (with web_search tool, max 5 uses)
**Purpose:** Comprehensive web research on a specific competitor

```
Find detailed information about "{competitor}" as a {subCategory} ({category}) software product. 
Include: product features and capabilities (2025), comparison vs Workday Adaptive Planning, 
pricing, reviews, integrations, and architecture details. Provide source URLs.
```

---

### 7. Intelligence Summarization
**Used in:** `chat-analysis/index.ts` (line 128)
**Model:** Gemini 2.5 Flash Lite
**Purpose:** Condense raw web research into a concise intelligence brief

```
Summarize the following raw web research about "{competitor}" in the "{subCategory}" software 
category into a concise competitive intelligence brief (max 2000 chars). Focus on: key product 
features, differentiators, pricing model, integrations, and any comparison points vs Workday 
Adaptive Planning. Include source URLs where available.

{rawIntel (up to 15000 chars)}
```

---

### 8. Research Routing Classifier
**Used in:** `chat-analysis/index.ts` (line 157)
**Model:** Gemini 2.5 Flash Lite
**Purpose:** Determine if a follow-up question needs fresh web research or can be answered from context

```
SYSTEM: You are a routing classifier. Given a follow-up question and the prior conversation, 
decide if the question can be answered from the existing conversation context OR if it requires 
fresh web search/scraping for new data.

Answer ONLY with one word: "context" if it can be answered from existing conversation, or 
"research" if new web data is needed.

Examples needing "research": latest pricing, recent news, new feature announcements, specific 
technical specs not in context, current market share data.
Examples needing "context": clarification of previous answer, deeper explanation of already-
discussed topics, reformatting, summarization, opinion/analysis based on existing data.
```

---

### 9. Competitive Analysis — Main System Prompt
**Used in:** `chat-analysis/index.ts` (line 267)
**Model:** Gemini 2.5 Flash
**Purpose:** Generate the structured competitive analysis response

```
SYSTEM: You are a Competitive Intelligence Analyst specializing in enterprise FP&A and EPM 
software, with deep expertise in Workday Adaptive Planning.

Your role: Generate structured, factual competitive breakdowns comparing {competitor} against 
Workday Adaptive Planning in the {subCategory} capability area ({category}).

{If intelligence brief available:}
You have access to a summarized competitive intelligence brief. Use this data for accurate 
analysis. Cite sources with URLs when available.

--- INTELLIGENCE BRIEF ---
{webIntel}
--- END BRIEF ---

Always structure your initial analysis with these sections (use ## for section headers):

## Feature Capability Comparison
Use a markdown table with columns: Feature, {competitor}, Workday Adaptive Planning, Verdict.

## Implementation & Architecture Differences
How each product approaches the problem architecturally. Use a table if comparing specific aspects.

## AI Capabilities
AI/ML features if applicable (state "Not applicable" if none)

## Integration Methods
APIs, connectors, data flows, ecosystem. Use a table with columns: Integration Type, {competitor}, 
Workday Adaptive Planning.

## Performance & Scale
Known benchmarks, customer scale, performance characteristics

## Strengths vs Weaknesses
Use a table with columns: Aspect, {competitor}, Workday Adaptive Planning

## Reference Links
List all source URLs used, each on its own line starting with a dash.

FORMATTING RULES:
- Use markdown tables (with | delimiters) for comparisons
- Use ## for section headers only
- Use plain text paragraphs for descriptions
- Use bullet lists (starting with -) for enumerations
- Always include full URLs as plain text so they can be hyperlinked
- Be factual. If you don't know something, say so
- Avoid marketing language. Focus on technical and functional capabilities.

IMPORTANT: Never expose or leak any internal adaptive planning data, training guides, or 
proprietary information in your responses. Only share publicly available competitive analysis.
```

---

### 10. LLM-as-Judge Evaluation
**Used in:** `chat-analysis/index.ts` (line 196)
**Model:** Gemini 2.5 Flash Lite
**Purpose:** Score the quality of generated competitive analysis

```
You are evaluating a competitive analysis response comparing "{competitor}" vs Workday Adaptive 
Planning in "{subCategory}".

Score the following response on these 5 criteria (1-10 each):

1. **factual_correctness**: Are facts accurate? Are claims supported?
2. **structural_clarity**: Is the response well-organized with clear sections/tables?
3. **depth_of_comparison**: How thorough is the competitive comparison?
4. **visual_evidence**: Are tables, formatting, and structure used effectively?
5. **citation_coverage**: Are sources cited? Are URLs provided?

Also compute **overall_score** as the average of all 5.

Return ONLY a JSON object like:
{"factual_correctness":7,"structural_clarity":8,"depth_of_comparison":6,"visual_evidence":7,
"citation_coverage":5,"overall_score":6.6}

Response to evaluate:
{content (up to 8000 chars)}
```

---

## Database Tables

| Table | Purpose |
|-------|---------|
| `competitors` | Stores seed + AI-discovered competitors per category/sub-category |
| `chat_threads` | Conversation threads linked to user, category, sub-category, competitor |
| `chat_messages` | Individual messages (user/assistant) within threads |
| `evaluation_scores` | LLM-as-Judge quality scores per assistant message |
| `validated_responses` | User-validated (thumbs up/down) responses for knowledge base |
| `profiles` | User profile data (display name, email) |

---

## Data Taxonomy

### Charters → Product Areas

| Charter | Product Areas |
|---------|--------------|
| **Reporting & Analytics** | Web-Based Matrix Reporting, OfficeConnect, Workday for Google Sheets, Dashboards & Visualization, Ad-Hoc Analysis |
| **Modeling & Architecture** | Elastic Hypercube Technology, Standard Sheets, Cube Sheets, Modeled Sheets, Dimensions & Attributes |
| **Intelligent Planning** | Predictive Forecaster, Anomaly Detection |
| **Integration** | Data Integration, Drill-Through |
| **Collaboration & Workflow** | Process Tracker, Workflow, Cell Notes & Audit Trail |
| **Specialized Planning Modules** | Workforce Planning, Sales Planning, Consolidation |
