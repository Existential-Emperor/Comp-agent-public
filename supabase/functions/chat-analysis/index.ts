import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getProductAreaDescription } from "../_shared/product-areas.ts";
import { retrieveKnowledge } from "../_shared/knowledge-retrieval.ts";
import { retrieveDocKnowledge, retrieveRoadmapKnowledge } from "../_shared/kb-doc-retrieval.ts";
import { firecrawlFetch, hasFirecrawlKey } from "../_shared/firecrawl-keys.ts";
import { monitoredFetch } from "../_shared/monitored-fetch.ts";
import { buildSlideSummaryPayload, SLIDE_SUMMARY_MODEL, type SlideSummaryPayload } from "../_shared/slide-summary.ts";
import {
  isGalleryOnlyCompetitor,
  mediaDedupeKey,
  type GalleryMediaResult,
} from "../_shared/media-helpers.ts";
import {
  startMediaGather, gatherOnDemandMedia,
  type MediaGatherHandle, type MediaFullResult, type MediaItemPayload, type LiveCrawlMetadata,
} from "../_shared/media-pipeline.ts";
import {
  getCachedIntelligence, gatherLiveIntelligenceAndMedia, claudeWebSearch,
  classifyIntent, extractUrls, scrapeUserUrls, discoverAndScrapeSubpages,
} from "../_shared/intelligence-helpers.ts";
import { evaluateResponse, type JudgeEvaluation } from "../_shared/judge-helpers.ts";
import { runResponseContract, judgeResponse } from "../_shared/response-contract.ts";
import { classifyQueryIntent } from "../_shared/query-intent.ts";
import { getProfilesByNames, formatProfilesForPrompt, getPriorityUrls, findProfilesInText } from "../_shared/competitor-profiles.ts";
import { fetchFeedEvidenceForCompetitors, type FeedEvidence } from "../_shared/feed-context.ts";
import { EvidenceSourceRegistry } from "../_shared/evidence-source-registry.ts";
import { finalizeResponse } from "../_shared/finalize-response.ts";
import { safeStage } from "../_shared/safe-stage.ts";
import type { PipelineDiagnostics, StageDiagnostics } from "../_shared/pipeline-types.ts";
// redeploy-marker: 2026-05-01T15:30Z V1-deleted

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function queueBackgroundTask(task: Promise<unknown>) {
  try {
    const edgeRuntime = (globalThis as any)?.EdgeRuntime;
    if (edgeRuntime?.waitUntil && typeof edgeRuntime.waitUntil === "function") {
      edgeRuntime.waitUntil(task);
    }
  } catch { /* no-op */ }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const traceStartTime = Date.now();
  const toolCallsLog: any[] = [];
  const retrievedDocs: any[] = [];

  const sseHeaders = {
    ...corsHeaders,
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
  };

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabaseAuth = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );
    // CRITICAL_AWAIT_OK: fail-hard by design — see surrounding try/catch
    const { data: { user }, error: userErr } = await supabaseAuth.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabaseService = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // CRITICAL_AWAIT_OK: primary HTTP I/O on fail-hard path
    const { category, subCategory, competitor, competitors: competitorsList, message, threadId, history, isNewsSummary, newsContext, feedScope, feedCompetitorFilter } = await req.json();

    // Thread ownership: a caller may only write into a thread they own.
    // Prevents cross-user trace/message injection via a supplied threadId.
    if (threadId) {
      const { data: ownedThread, error: threadErr } = await supabaseService
        .from("chat_threads")
        .select("user_id")
        .eq("id", threadId)
        .maybeSingle();
      if (threadErr || !ownedThread || ownedThread.user_id !== user.id) {
        return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // Lightweight input validation: reject malformed types / abusive lengths.
    const tooLong = (v: unknown, max: number) => typeof v === "string" && v.length > max;
    if (
      tooLong(message, 20000) || tooLong(category, 200) || tooLong(subCategory, 200) ||
      tooLong(competitor, 300) || tooLong(newsContext, 200000) ||
      (threadId !== undefined && threadId !== null && typeof threadId !== "string") ||
      (competitorsList !== undefined && !Array.isArray(competitorsList)) ||
      (history !== undefined && !Array.isArray(history))
    ) {
      return new Response(JSON.stringify({ error: "Invalid input" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }



    let allCompetitors: string[] = Array.isArray(competitorsList) && competitorsList.length > 0 ? competitorsList : (competitor ? [competitor] : []);
    const feedFilteredCompetitors: string[] = Array.isArray(feedCompetitorFilter) ? feedCompetitorFilter : [];

    // --- General query competitor extraction (sheet-backed) ---
    // When no competitor was selected, look up the message against the full
    // 173-row XLSX knowledge base. Whole-word, longest-name-first matching.
    if (allCompetitors.length === 0 && message && !isNewsSummary) {
      try {
        // CRITICAL_AWAIT_OK: fail-hard by design — see surrounding try/catch
        const matched = await findProfilesInText(message);
        if (matched.length > 0) {
          allCompetitors = matched.map((p) => p.name);
          console.log(`General query: matched sheet KB competitors: ${allCompetitors.join(", ")}`);
        }
      } catch (e) {
        console.error("findProfilesInText failed:", e);
      }
    }

    // ===== NEWS SUMMARY MODE =====
    if (isNewsSummary && newsContext) {
      const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
      if (!LOVABLE_API_KEY) {
        return new Response(JSON.stringify({ error: "AI not configured" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const agentSource = "feed_agent";
      const scopedItemCount = (newsContext.match(/\[(\d+)\]/g) || []).length;
      const normalizedMessage = String(message || "").toLowerCase();
      const mentionsFeedEvidence = /\b(news|article|articles|community|post|posts|discussion|discussions|feed|sentiment|announcement|launch|reddit|linkedin|source|sources|press|coverage)\b/.test(normalizedMessage);
      const asksForDeepProductAnalysis = /\b(deep\s*dive|full\s*product|swot|feature\s+(?:comparison|analysis)|capabilit(?:y|ies)|architecture|integration|workflow|modeling|forecasting|implementation|pricing|roadmap|compare\b.*\b(?:workday|pigment|anaplan|planful|oracle|sap|onestream|jedox|prophix|board|ibm)\b)\b/.test(normalizedMessage);
      const knownCompetitors = ["anaplan", "planful", "pigment", "datarails", "jedox", "onestream", "prophix", "workiva", "oracle", "sap", "ibm", "board", "vena", "workday", "tagetik"];
      const mentionsUnknownProduct = !knownCompetitors.some(c => normalizedMessage.includes(c));
      const shouldRedirectToCompAgent = asksForDeepProductAnalysis && !mentionsFeedEvidence;

      // --- Auto-scrape URLs from user message ---
      const feedMessageUrls = extractUrls(message || "");
      let liveSearchResults = "";
      if (feedMessageUrls.length > 0) {
        // CRITICAL_AWAIT_OK: live-crawl helper inside try/catch on fail-hard path
        const scrapedContent = await scrapeUserUrls(feedMessageUrls);
        if (scrapedContent.length > 0) {
          liveSearchResults = `\n\n--- DIRECT URL SCRAPE RESULTS ---\n${scrapedContent.join("\n\n")}\n--- END DIRECT SCRAPE ---`;
          console.log(`Feed agent: auto-scraped ${scrapedContent.length} URLs from user message`);
        }
      }

      // --- Intelligent live search decision ---
      // Use a lightweight LLM to decide if a live search is needed
      let searchDecision: { needsSearch: boolean; searchQueries: string[]; reason: string } = { needsSearch: false, searchQueries: [], reason: "default" };

      if (!shouldRedirectToCompAgent) {
        try {
          const classificationPrompt = `You are a search-need classifier for a competitive intelligence feed agent focused on FP&A/EPM software. You also handle GENERAL COMPANY RESEARCH queries.

Given the user's query, conversation history context, and the number of feed items available, decide if a LIVE WEB SEARCH is needed TO SUPPLEMENT the feed data. The feed data is ALWAYS provided to the agent — you are deciding whether ADDITIONAL live search is also needed.

IMPORTANT: This is a HYBRID system. The agent always sees the feed items. Your job is to decide if the query ALSO requires real-time web intelligence beyond what a news/community feed would contain.

SEARCH IS NEEDED when:
- User asks about a competitor/product NOT well covered in the feed (especially unknown/niche products)
- User asks for specific factual data (people, funding, revenue, headcount, LinkedIn profiles, etc.)
- User asks about company leadership, executives, founders, or their backgrounds/social profiles
- User asks about company financials, funding rounds, valuations, investors, IPO status
- User asks about company size/segment, market positioning, employee/customer count
- User asks about market size, TAM, industry analysis
- User asks about acquisitions, partnerships, strategic moves
- User asks about specific people by role (e.g. "VP of Product", "CRO", "Head of Engineering")
- User asks for LinkedIn, Twitter, or other social media profiles
- The feed has very few items (<3) for the topic in question
- User asks for customer reviews, user experiences not likely in the feed

SEARCH IS NOT NEEDED when:
- User asks for a general summary of available news/feed items
- User asks "what's new" or "latest updates" (just summarize existing feed)
- User asks to analyze or group the existing feed items
- User asks follow-up questions about previously discussed content that was already answered
- User asks general/conversational questions (greetings, thanks, etc.)

CRITICAL — SEARCH QUERY QUALITY:
- Generate HIGHLY SPECIFIC search queries that will directly find the answer
- For people searches: include the company name AND the role AND "LinkedIn" (e.g. "Datarails VP Product LinkedIn profile name")
- For funding: include the company name AND "funding round" or "series" (e.g. "Datarails latest funding round 2024 2025")
- For leadership: include name if known from conversation history (e.g. "Didi Gurfinkel LinkedIn" not just "Datarails CEO LinkedIn")
- NEVER generate vague queries like "Datarails leadership" when the user asked for a specific role
- Use conversation history to enrich queries (e.g. if CEO name was already discussed, use it)

CONVERSATION HISTORY (last few messages for context):
${(history || []).slice(-4).map((m: any) => `${m.role}: ${m.content?.slice(0, 200)}`).join("\n")}

Respond in JSON only:
{
  "needs_search": true/false,
  "search_queries": ["very specific query 1", "very specific query 2"],
  "reason": "brief explanation"
}

USER QUERY: "${String(message || "").replace(/"/g, '\\"')}"
AVAILABLE FEED ITEMS: ${scopedItemCount}
FEED SCOPE: ${feedScope || "all competitors"}
ACTIVE COMPETITOR FILTER: ${feedFilteredCompetitors.length > 0 ? feedFilteredCompetitors.join(", ") : "all competitors"}`;
          // CRITICAL_AWAIT_OK: primary LLM generation — fail-hard by design
          const classifyRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${LOVABLE_API_KEY}` },
            body: JSON.stringify({
              model: "openai/gpt-5.4-nano",
              messages: [{ role: "user", content: classificationPrompt }],
              max_completion_tokens: 300,
            }),
          });

          if (classifyRes.ok) {
            // CRITICAL_AWAIT_OK: primary HTTP I/O on fail-hard path
            const classifyData = await classifyRes.json();
            const rawText = classifyData.choices?.[0]?.message?.content || "";
            const jsonMatch = rawText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              const parsed = JSON.parse(jsonMatch[0]);
              searchDecision = {
                needsSearch: !!parsed.needs_search,
                searchQueries: Array.isArray(parsed.search_queries) ? parsed.search_queries.slice(0, 2) : [],
                reason: parsed.reason || "",
              };
            }
          }
          console.log(`Feed search decision: needsSearch=${searchDecision.needsSearch}, reason="${searchDecision.reason}"`);
        } catch (e) {
          console.error("Search classification error:", e);
        }
      }

      // Execute live searches if the classifier determined they're needed
      // Two-step pipeline: 1) Claude web search discovers URLs, 2) Firecrawl extracts full content
      if (searchDecision.needsSearch && searchDecision.searchQueries.length > 0) {
        try {
          const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY");
          const searchResultItems: string[] = [];

          for (const sq of searchDecision.searchQueries) {
            try {
              // Step 1: Use Claude web search (Anthropic API) to discover relevant URLs
              let discoveredUrls: { title: string; url: string; snippet: string }[] = [];
              if (ANTHROPIC_KEY) {
                // CRITICAL_AWAIT_OK: live-crawl helper inside try/catch on fail-hard path
                const searchResults = await claudeWebSearch(sq, 5);
                for (const text of searchResults) {
                  const urlMatch = text.match(/https?:\/\/[^\s)\]]+/);
                  if (urlMatch?.[0]) {
                    discoveredUrls.push({
                      title: text.slice(0, 100),
                      url: urlMatch[0],
                      snippet: text.slice(0, 300),
                    });
                  }
                }
                console.log(`Claude search for "${sq.slice(0, 60)}": found ${discoveredUrls.length} URLs`);
              }

              // If Claude didn't find enough, use Firecrawl search as a discovery fallback
              if (hasFirecrawlKey() && discoveredUrls.length < 3) {
                try {
                  // CRITICAL_AWAIT_OK: live-crawl helper inside try/catch on fail-hard path
                  const fcSearchRes = await firecrawlFetch("https://api.firecrawl.dev/v1/search", {
                    method: "POST",
                    body: JSON.stringify({ query: sq, limit: 5, scrapeOptions: { formats: ["markdown"] } }),
                  });
                  if (fcSearchRes.ok) {
                    // CRITICAL_AWAIT_OK: primary HTTP I/O on fail-hard path
                    const fcSearchData = await fcSearchRes.json();
                    for (const r of (fcSearchData.data || [])) {
                      if (r.url && !discoveredUrls.some(d => d.url === r.url)) {
                        discoveredUrls.push({
                          title: r.title || r.metadata?.title || "",
                          url: r.url,
                          snippet: r.markdown?.slice(0, 300) || r.description || "",
                        });
                      }
                    }
                  }
                } catch { /* firecrawl search fallback */ }
              }

              // Step 2: Use Firecrawl API to extract full content from discovered URLs
              // Scrape top 3 URLs in parallel for speed
              const urlsToScrape = discoveredUrls.slice(0, 3);
              if (hasFirecrawlKey() && urlsToScrape.length > 0) {
                const scrapePromises = urlsToScrape.map(async (item) => {
                  try {
                    // CRITICAL_AWAIT_OK: live-crawl helper inside try/catch on fail-hard path
                    const scrapeRes = await firecrawlFetch("https://api.firecrawl.dev/v1/scrape", {
                      method: "POST",
                      body: JSON.stringify({
                        url: item.url,
                        formats: ["markdown"],
                        onlyMainContent: true,
                      }),
                    });
                    if (scrapeRes.ok) {
                      // CRITICAL_AWAIT_OK: primary HTTP I/O on fail-hard path
                      const scrapeData = await scrapeRes.json();
                      const fullMarkdown = scrapeData.data?.markdown || scrapeData.markdown || "";
                      if (fullMarkdown.length > 50) {
                        item.snippet = fullMarkdown; // Use full extracted content
                        console.log(`Firecrawl extracted ${fullMarkdown.length} chars from ${item.url}`);
                      }
                    }
                  } catch (e) {
                    console.error(`Firecrawl scrape failed for ${item.url}:`, e);
                  }
                });
                await Promise.all(scrapePromises);
              }

              // Build final result items from all discovered URLs (enriched with Firecrawl content)
              for (const item of discoveredUrls) {
                searchResultItems.push(`- "${item.title}" (${item.url})\n  ${item.snippet}`);
              }
            } catch { /* ignore search error */ }
          }

          if (searchResultItems.length > 0) {
            liveSearchResults = `\n\n--- LIVE SEARCH RESULTS (real-time web intelligence) ---\nThe following items were found via live web search and content extraction to supplement the feed data:\n\n${searchResultItems.join("\n\n")}\n--- END LIVE SEARCH ---`;
          }
        } catch (e) {
          console.error("Feed agent live search error:", e);
        }
      }

      const newsSystemPrompt = `You are a Competitive Intelligence News Analyst and General Research Assistant specializing in FP&A and EPM software. You help users understand and analyze competitive news, community discussions, AND perform general company research.

You operate in a HYBRID mode with TWO data sources that are ALWAYS combined:
1. SCOPED FEED ITEMS — pre-filtered news and community items from the feed database (always available)
2. LIVE SEARCH RESULTS (when available) — real-time web search results that supplement the feed data

CRITICAL RULES:
1. ALWAYS synthesize BOTH feed items AND live search results into a unified, comprehensive answer. Never treat them as separate — weave insights from both sources together naturally.
2. NEVER say phrases like "I don't have access to", "I cannot verify", "I'm unable to retrieve", "I don't have real-time access", "I cannot browse", or similar disclaimers. You have the data right here.
3. NEVER punt to the user. Do NOT say things like "If you tell me the name...", "You can search LinkedIn for...", "Try searching for...", "I recommend checking...". YOU are the researcher — present what you found definitively. If you have partial information, present it confidently and offer to dig deeper, but never ask the user to do research themselves.
4. If asked about a competitor or product NOT in the feed scope, use the live search results to provide whatever intelligence you found. Present the findings proactively.
5. If the user asks for a deeper product or competitor analysis beyond news/community evidence, politely redirect them to Comp Agent.
6. Never expose internal adaptive planning data or proprietary information.
7. When live search results are available, EXTRACT specific facts (names, titles, URLs, numbers) from the raw content — don't just summarize that results were found.
8. For community sentiment questions, focus on actual user opinions, complaints, praise, and experiences from the data.
9. For people/LinkedIn queries: Extract the ACTUAL person's name and profile URL from search results. If the search results contain a LinkedIn URL, present it as a direct link. If results mention a person's name for the role, state it definitively.

GENERAL RESEARCH CAPABILITY:
- You can answer questions about company leadership (CEO, CTO, founders, VP, directors), their LinkedIn profiles, and backgrounds
- You can research funding rounds, revenue estimates, valuations, and investor information
- You can determine company size/segment (mid-market, enterprise, SMB, employee count)
- You can research market size, TAM, and industry positioning
- You can find information about acquisitions, partnerships, and strategic moves
- For these general research queries, EXTRACT AND PRESENT specific facts from LIVE SEARCH RESULTS with source citations

CURRENT FILTER SCOPE:
${feedScope || "Use only the provided filtered feed items."}
${feedFilteredCompetitors.length > 0 ? `\nFEED DATA IS FILTERED TO: ${feedFilteredCompetitors.join(", ")}. The feed items below are scoped to these competitors. However, ALWAYS prioritize answering the user's actual question. If the user asks about a different competitor than what the feed is filtered to, use live search results to answer about that competitor — do NOT force-inject the filtered competitors into the response.\n` : ""}

--- FEED DATA (${scopedItemCount} items) ---
${newsContext}
--- END FEED DATA ---
${liveSearchResults}

FORMATTING RULES:
- Use ## for section headers
- Use bullet lists for key points
- Be concise and actionable
- Focus on competitive implications and strategic insights
- Reference specific articles/sources by their title and source name
- When summarizing, group by competitor/vendor for clarity
- IMPORTANT: Always embed hyperlinks to source articles using markdown link syntax [Article Title](URL). Every time you reference an article, link to it.
- For LinkedIn profiles: Always present as a clickable markdown link [Person Name](linkedin-url)
- Never show raw URLs without markdown link formatting`;

      const sanitizedNewsHistory = (history || []).filter(
        (msg: any) => msg && typeof msg.content === "string" && msg.content.trim() !== ""
      );
      const aiMessages = [
        { role: "system", content: newsSystemPrompt },
        ...sanitizedNewsHistory,
        { role: "user", content: message || "Summarize the latest news." },
      ];

      const encoder = new TextEncoder();
      const newsStream = new ReadableStream({
        async start(controller) {
          const sendEvent = (event: string, data: any) => {
            try { controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)); } catch {}
          };
          const keepalive = setInterval(() => sendEvent("ping", { ts: Date.now() }), 15000);

          try {
            if (shouldRedirectToCompAgent && !mentionsUnknownProduct) {
              sendEvent("content", {
                content: "## Better handled by Comp Agent\n- I can analyze only the news and community items in the current filtered feed scope.\n- This request sounds like a deeper product or competitor analysis, so Comp Agent will give you a stronger answer.\n- If you want, I can still summarize the feed signals for that competitor within the current scope.",
              });
              sendEvent("done", {});
              return;
            }

            const newsLlmStartTime = Date.now();
            let newsUsage: any = {};
            // CRITICAL_AWAIT_OK: primary LLM generation — fail-hard by design
            const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${LOVABLE_API_KEY}` },
              body: JSON.stringify({ model: "openai/gpt-5.5", messages: aiMessages, stream: true }),
            });

            if (!response.ok) {
              sendEvent("error", { content: `AI error (${response.status})` });
              clearInterval(keepalive);
              controller.close();
              return;
            }

            let fullContent = "";
            const reader = response.body?.getReader();
            const decoder = new TextDecoder();
            let streamBuffer = "";

            if (reader) {
              while (true) {
                // CRITICAL_AWAIT_OK: SSE stream loop — fail-hard by design
                const { done, value } = await reader.read();
                if (done) break;
                streamBuffer += decoder.decode(value, { stream: true });
                let newlineIndex: number;
                while ((newlineIndex = streamBuffer.indexOf("\n")) !== -1) {
                  let line = streamBuffer.slice(0, newlineIndex);
                  streamBuffer = streamBuffer.slice(newlineIndex + 1);
                  if (line.endsWith("\r")) line = line.slice(0, -1);
                  if (!line.startsWith("data: ")) continue;
                  const jsonStr = line.slice(6).trim();
                  if (jsonStr === "[DONE]") break;
                  try {
                    const parsed = JSON.parse(jsonStr);
                    const delta = parsed.choices?.[0]?.delta?.content;
                    if (delta) { fullContent += delta; sendEvent("token", { token: delta }); }
                    if (parsed.usage) { newsUsage = parsed.usage; }
                  } catch { streamBuffer = line + "\n" + streamBuffer; break; }
                }
              }
            }

            const disclaimerPatterns = [
              /I don['']t have (?:access|real-time access) to[^.]*\./gi,
              /I(?:'m| am) unable to (?:access|retrieve|browse|verify)[^.]*\./gi,
              /I cannot (?:access|browse|retrieve|verify)[^.]*\./gi,
              /As an AI,? I (?:don['']t|cannot|can['']t)[^.]*\./gi,
              /I don['']t have the ability to[^.]*\./gi,
            ];
            let sanitizedContent = fullContent || "Unable to generate summary.";
            for (const pattern of disclaimerPatterns) {
              sanitizedContent = sanitizedContent.replace(pattern, "").trim();
            }
            sanitizedContent = sanitizedContent.replace(/\n{3,}/g, "\n\n").trim();

            const messageId = crypto.randomUUID();
            const traceId = crypto.randomUUID();
            sendEvent("content", { content: sanitizedContent, messageId });
            sendEvent("metadata", { traceId });
            sendEvent("done", {});

            // All persistence off the user's critical path.
            const newsLatencyMs = Date.now() - newsLlmStartTime;
            queueBackgroundTask((async () => {
              try {
                await supabaseService.from("chat_messages").insert({
                  id: messageId,
                  thread_id: threadId,
                  user_id: user.id,
                  role: "assistant",
                  content: sanitizedContent,
                  metadata: { trace_id: traceId },
                });
              } catch (e) { console.error("News chat_messages insert error:", e); }

              try {
                await supabaseService.from("agent_traces").insert({
                  id: traceId,
                  message_id: messageId,
                  user_id: user.id, category: category || "News Summary", sub_category: subCategory || "News",
                  thread_id: threadId || null, competitor_name: null,
                  user_prompt: message, system_prompt: newsSystemPrompt,
                  raw_llm_output: sanitizedContent, formatted_output: sanitizedContent,
                  model_used: "openai/gpt-5.5", status: "completed",
                  trace_type: "conversation", agent_source: agentSource,
                  latency_ms: newsLatencyMs,
                  prompt_tokens: newsUsage.prompt_tokens || null,
                  completion_tokens: newsUsage.completion_tokens || null,
                  total_tokens: newsUsage.total_tokens || null,
                  retrieved_documents: [], tool_calls: [],
                  metadata: { slide_summary_status: "pending", slide_summary_model: SLIDE_SUMMARY_MODEL },
                });
              } catch (e) { console.error("News trace error:", e); }

              try {
                const slideSummary = await buildSlideSummaryPayload(sanitizedContent, `${category || "News Summary"} ${subCategory || "News"}`.trim(), LOVABLE_API_KEY);
                const slideMetadata = slideSummary
                  ? { slide_summary_status: "ready", slide_summary_model: slideSummary.model, slide_summary_version: slideSummary.version, slide_summary_generated_at: slideSummary.generated_at, slide_section_summaries: slideSummary.sections, slide_summary_lookup: slideSummary.lookup, slide_summary_diagnostics: slideSummary.diagnostics, slide_summary_error: null }
                  : { slide_summary_status: "failed", slide_summary_model: SLIDE_SUMMARY_MODEL, slide_summary_error: "no_sections_parsed" };
                await supabaseService.from("agent_traces").update({ metadata: slideMetadata }).eq("id", traceId).eq("user_id", user.id);
              } catch (summaryErr) { console.error("News slide summary error:", summaryErr); }
            })());
          } catch (e) {
            console.error("News summary error:", e);
            sendEvent("error", { content: "Failed to generate summary." });
          } finally {
            clearInterval(keepalive);
            try { controller.close(); } catch {}
          }
        },
      });

      return new Response(newsStream, { headers: sseHeaders });
    }

    // ===== COMPETITIVE ANALYSIS MODE =====
    const encoder = new TextEncoder();
    // SSE CONTRACT — operations between the last token emitted and controller.close():
    //   (a) operations that change VISIBLE content, with a hard time budget < 10s
    //       (e.g. response-contract repair), or
    //   (b) milliseconds of housekeeping (id generation, sendEvent calls).
    // Anything else (LLM judge, slide summary, persistence) goes through
    // queueBackgroundTask and runs AFTER the stream closes. Operational
    // persistence — eval scores, trace metadata, judge scores — is ALWAYS written
    // server-side here, NEVER from the client.
    const stream = new ReadableStream({
      async start(controller) {
        const sendEvent = (event: string, data: any) => {
          try { controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)); } catch {}
        };
        const keepalive = setInterval(() => sendEvent("ping", { ts: Date.now() }), 15000);

        try {
          console.error("[chat-analysis:boot] version=2026-05-01T15:15Z flat-shared");

          // Hoisted so the outer catch can serialize whatever stages completed
          // before the crash. Pre-stream stages push directly into this array
          // (see [stage:enter]/[stage:exit] markers below).
          const stageDiagnostics: StageDiagnostics[] = [];
          let lastEnteredStage: string | null = null;
          const enterStage = (name: string) => {
            lastEnteredStage = name;
            console.error(`[stage:enter] ${name}`);
          };
          const exitStage = (name: string, ms?: number) => {
            stageDiagnostics.push({ name, status: "ok", ms: ms ?? 0 });
            console.error(`[stage:exit] ${name}${ms !== undefined ? ` (${ms}ms)` : ""}`);
          };


          sendEvent("progress", { step: "Starting analysis..." });

          // Intent-based classification using GPT-5 Nano
          sendEvent("progress", { step: "Classifying query intent..." });
          // CRITICAL_AWAIT_OK: intent classification on fail-hard path
          const intentResult = await classifyIntent(message, history, {
            competitor: allCompetitors[0] || competitor,
            category, subCategory,
            agent: "comp",
          });
          const doResearch = intentResult.needsResearch;
          const doGeneralResearch = intentResult.needsGeneralResearch;

          // Classify query intent (narrow vs broad, entities, asksMedia, asksCommunity)
          // BEFORE media lookup so off-topic gallery items are filtered at the source —
          // not just at the post-hoc response-contract gate. Privacy: only the user
          // prompt is sent to the classifier; no Adaptive Planning content is forwarded.
          // CRITICAL_AWAIT_OK: intent classification on fail-hard path
          const queryIntent = await classifyQueryIntent(message).catch((err) => {
            console.warn("classifyQueryIntent failed; falling back to broad scope:", err);
            return {
              scope: "broad" as const, entities: [], asksCommunity: false, asksMedia: false,
              asksComparison: false, competitors: [], depthExpected: "medium" as const, type: "other" as const,
            };
          });
          console.log(`Query intent: scope=${queryIntent.scope} entities=[${queryIntent.entities.join(", ")}] asksMedia=${queryIntent.asksMedia} asksCommunity=${queryIntent.asksCommunity}`);

          // ===== FP&A SCOPE GUARDRAIL =====
          // If no competitor in the sheet KB matched AND the user picked the generic
          // "General/General" charter (i.e. they did NOT pick a real charter/product
          // area), treat the query as potentially off-topic. We only proceed with
          // research if the topic is plausibly finance/planning related; otherwise
          // we politely redirect without spending Claude/Firecrawl credits.
          const FPA_SCOPE_RE = /\b(fp&?a|epm|cpm|financial planning|workforce planning|workforce|finance|cfo|controller|treasur|consolidat|close|forecast|forecasting|budget|budgeting|plan(?:ning)?|model(?:ing|ling)?|allocation|driver[- ]based|scenario|variance|reporting|account|accounting|erp|hris|adaptive|anaplan|pigment|onestream|planful|vena|sap|oracle|workday|gartner|peer|competitor|saas|enterprise|midmarket|mid[- ]market|smb|tagetik|jedox|datarails|prophix|workiva|ibm|tm1|board)\b/i;
          const isGenericCharter = (category === "General" || !category) && (subCategory === "General" || !subCategory);
          const looksOnTopic = FPA_SCOPE_RE.test(message || "") || allCompetitors.length > 0;
          if (isGenericCharter && allCompetitors.length === 0 && !looksOnTopic && (message || "").trim()) {
            const refusal = `I focus on competitive intelligence for **financial planning, workforce planning, FP&A, and EPM** — including the vendors tracked in our knowledge base.\n\nThe topic you asked about doesn't appear to fall in that scope, so I'm holding off on a full research run. Try asking about:\n- A specific FP&A/EPM vendor (e.g. Anaplan, Pigment, Aleph, Campfire, OneStream)\n- A planning capability (forecasting, consolidation, workforce planning, modeling, allocations, driver-based planning)\n- A vs-Workday Adaptive Planning comparison`;
            sendEvent("content", { content: refusal });
            sendEvent("done", { content: refusal });
            clearInterval(keepalive);
            controller.close();
            return;
          }

          let webIntel = "";
          let mediaContext = "";
          // Lifted to outer scope so trace insert can reference them even when
          // doResearch is false or when the research branch never executed.
          let galleryResultsOuter: GalleryMediaResult[] = [];
          let liveCrawlMetadataOuter: LiveCrawlMetadata[] = [];
          // Media pipeline runs in PARALLEL with synthesis (decoupled channel).
          // `mediaHandle` is created at the top of the research branch so the
          // gallery lookup starts immediately. The FAST phase (gallery + YouTube)
          // is streamed over the `media` SSE channel during research, so the live
          // gallery is already populated before the prose finishes. The SLOW phase
          // (`fullMediaPromise`: live crawls + quality gate) is NOT awaited on the
          // critical path — it, the <<NEEDS_MEDIA>> on-demand gather, and the
          // canonical "## Visual Overview" reconstruction all run in the BACKGROUND
          // task after stream close, and are embedded into the PERSISTED content
          // (the single source a reload re-renders from). This keeps media
          // finalization off the prose-done signal so a large gallery quality gate
          // can never stall the user's stream.
          let mediaHandle: MediaGatherHandle | null = null;
          let fullMediaPromise: Promise<MediaFullResult> | null = null;
          let mediaItemsForClient: MediaItemPayload[] = [];

          // --- FEED EVIDENCE INJECTION ---
          // Pull recent news + (intent-gated) community items from the curated
          // `news_items` table for the resolved competitors, so Comp Agent can
          // answer "what's the latest" / "what are users saying" without firing
          // fresh Firecrawl calls. Items are deep-URL ready for citation.
          let feedEvidence: FeedEvidence = {
            newsBlock: "", communityBlock: "", newsItems: [], communityItems: [], urls: [],
          };
          if (allCompetitors.length > 0) {
            const feedStage = await safeStage(
              'feed_evidence',
              async () => fetchFeedEvidenceForCompetitors(supabaseService, allCompetitors, {
                // Always pull community signals so the Comp Agent can surface a
                // mandatory "## Community Sentiment" section whenever items exist
                // for the resolved competitor(s) — not just on Full Product or
                // explicit sentiment queries. Availability (communityItems.length)
                // is what gates the mandate downstream (prompt + contract).
                includeCommunity: true,
              }),
              { newsBlock: "", communityBlock: "", newsItems: [], communityItems: [], urls: [] } as FeedEvidence,
              { timeoutMs: 20_000 },
            );
            stageDiagnostics.push(feedStage.diagnostics);
            feedEvidence = feedStage.value;
            if (feedEvidence.newsBlock) webIntel = feedEvidence.newsBlock;
            if (feedEvidence.communityBlock) {
              webIntel = webIntel ? webIntel + "\n\n" + feedEvidence.communityBlock : feedEvidence.communityBlock;
            }
            console.log(`Feed evidence: ${feedEvidence.newsItems.length} news + ${feedEvidence.communityItems.length} community items injected${feedStage.degraded ? " [degraded]" : ""}`);
          }

          // --- URL auto-scraping: scrape any URLs the user provided ---
          if (intentResult.urlsToScrape.length > 0) {
            sendEvent("progress", { step: "Scraping URLs from your message..." });
            // CRITICAL_AWAIT_OK: live-crawl helper inside try/catch on fail-hard path
            const scrapedContent = await scrapeUserUrls(intentResult.urlsToScrape);
            if (scrapedContent.length > 0) {
              webIntel = scrapedContent.join("\n\n");
              console.log(`Auto-scraped ${scrapedContent.length} URLs from user message`);
            }
          }

          // --- Subpage discovery for unknown companies ---
          if (allCompetitors.length === 0 && intentResult.urlsToScrape.length > 0) {
            // Extract domain from scraped URLs for deep discovery
            for (const scrapedUrl of intentResult.urlsToScrape) {
              try {
                const urlObj = new URL(scrapedUrl);
                const domain = urlObj.hostname;
                sendEvent("progress", { step: `Discovering all pages on ${domain}...` });
                // CRITICAL_AWAIT_OK: live-crawl helper inside try/catch on fail-hard path
                const subpageContent = await discoverAndScrapeSubpages(domain);
                if (subpageContent.length > 0) {
                  sendEvent("progress", { step: `Scraped ${subpageContent.length} subpages and external references...` });
                  webIntel = webIntel
                    ? webIntel + "\n\n" + subpageContent.join("\n\n")
                    : subpageContent.join("\n\n");
                  console.log(`Subpage discovery added ${subpageContent.length} content pieces for ${domain}`);
                }
              } catch (e) {
                console.error(`Domain extraction failed for ${scrapedUrl}:`, e);
              }
            }
          }

          if (doResearch && allCompetitors.length > 0) {
            const competitorIntelStarted = Date.now();
            enterStage('competitor_intel');
            sendEvent("progress", { step: `Retrieving intelligence for ${allCompetitors.join(", ")}...` });
            try {

            // ── Media pipeline: launched in PARALLEL with intelligence
            // gathering. The fast phase (gallery DB lookup + YouTube) starts
            // immediately and does not depend on intel; the slow phase (live
            // crawls + AI quality gate) is kicked below WITHOUT awaiting so it
            // overlaps LLM generation and streams in via `media` SSE events.
            enterStage('media_gather');
            mediaHandle = startMediaGather({
              competitors: allCompetitors,
              category, subCategory,
              queryIntent: { scope: queryIntent.scope, entities: queryIntent.entities, asksMedia: queryIntent.asksMedia },
              onProgress: (step) => sendEvent("progress", { step }),
            });

            // ── Intelligence gathering. The synthesizer depends on this, so it
            // IS awaited before the LLM. Media bundled with cached/live intel is
            // threaded into the media pipeline's slow phase (for quality-gating)
            // rather than recomputed.
            const allCachedResults = await Promise.all(allCompetitors.map(comp => getCachedIntelligence(comp, subCategory, category)));

            const allIntelParts: string[] = [];
            const bundledMediaParts: string[] = [];
            let anyHasCache = false;
            let anyMissingCache = false;

            const maxIntelPerComp = allCompetitors.length > 2 ? 1200 : allCompetitors.length > 1 ? 1800 : 3000;

            for (let ci = 0; ci < allCompetitors.length; ci++) {
              const cached = allCachedResults[ci];
              const comp = allCompetitors[ci];
              if (cached.hasCachedData) {
                anyHasCache = true;
                const truncatedIntel = cached.intelligence.length > maxIntelPerComp
                  ? cached.intelligence.slice(0, maxIntelPerComp) + "\n[... truncated for prompt size]"
                  : cached.intelligence;
                allIntelParts.push(`\n=== INTELLIGENCE: ${comp} ===\n${truncatedIntel}`);
                if (cached.media && !isGalleryOnlyCompetitor(comp)) {
                  bundledMediaParts.push(cached.media.replace(/--- AVAILABLE OFFICIAL MEDIA ---/g, `--- ${comp.toUpperCase()} MEDIA ---`).replace(/--- END MEDIA ---/g, `--- END ${comp.toUpperCase()} MEDIA ---`));
                } else if (cached.media && isGalleryOnlyCompetitor(comp)) {
                  console.log(`Skipping non-gallery cached media for gallery-only competitor "${comp}"`);
                }
              } else {
                anyMissingCache = true;
              }
            }

            if (anyHasCache && !anyMissingCache) {
              const cachedIntel = allIntelParts.join("\n\n");
              webIntel = webIntel ? webIntel + "\n\n" + cachedIntel : cachedIntel;
              toolCallsLog.push({ tool: "getCachedIntelligence", cached: true, competitors: allCompetitors.length });
            } else {
              sendEvent("progress", { step: "Gathering live competitive intelligence..." });
              const liveResults = await Promise.all(
                allCompetitors.map(async (comp) => ({ comp, live: await gatherLiveIntelligenceAndMedia(comp, subCategory, category) })),
              );
              for (const { comp, live } of liveResults) {
                if (live.intelligence) allIntelParts.push(`\n=== INTELLIGENCE: ${comp} ===\n${live.intelligence}`);
                if (live.media) bundledMediaParts.push(live.media);
              }
              const liveIntel = allIntelParts.join("\n\n");
              webIntel = webIntel ? webIntel + "\n\n" + liveIntel : liveIntel;
              toolCallsLog.push({ tool: "gatherLiveIntelligenceAndMedia", cached: false, competitors: allCompetitors.length });
            }

            if (webIntel) retrievedDocs.push({ source: "intel", length: webIntel.length });

            // ── Fast media (gallery + YouTube): used for the grounding manifest
            // injected into the synthesizer prompt, and streamed to the client
            // immediately so the gallery paints before/while the prose streams.
            const fastMedia = await mediaHandle.fast;
            galleryResultsOuter = fastMedia.galleryResults;
            mediaContext = fastMedia.mediaContext;
            mediaItemsForClient = fastMedia.items;
            if (fastMedia.galleryMediaLines.length > 0) {
              toolCallsLog.push({ tool: "getGalleryMedia", totalGalleryAssets: fastMedia.galleryMediaLines.length });
            }
            if (fastMedia.items.length > 0) {
              sendEvent("media", { items: fastMedia.items, phase: "fast" });
            }
            sendEvent("progress", { step: "Intelligence loaded. Generating analysis..." });

            // ── Slow media (live crawls + quality gate) runs in the background,
            // overlapping LLM generation. Awaited at finalize for the final
            // mediaContext (citation/registry/persistence) + the authoritative
            // `media` event. The .catch keeps an inert promise if it fails.
            fullMediaPromise = mediaHandle.runFull(bundledMediaParts);
            fullMediaPromise.catch((e) => { console.error("media full phase error:", e); });

            exitStage('media_gather');
            stageDiagnostics.push({ name: 'competitor_intel', status: 'ok', ms: Date.now() - competitorIntelStarted });
            } catch (ciErr) {
              const msg = ciErr instanceof Error ? ciErr.message : String(ciErr);
              console.error('[safeStage:competitor_intel] failed_soft:', msg);
              stageDiagnostics.push({
                name: 'competitor_intel',
                status: 'failed_soft',
                ms: Date.now() - competitorIntelStarted,
                error: msg.slice(0, 400),
              });
              // Inert fallback: leave whatever partial webIntel/mediaContext was assembled.
            }
          }

          // --- Unified research pipeline: general/supplemental research ---
          // Fires when: general research needed, OR competitive research with no known competitors
          // (unknown company like "stacks.ai"), OR competitive research yielded no intel.
          if (doGeneralResearch || (doResearch && allCompetitors.length === 0) || (doResearch && !webIntel)) {
            sendEvent("progress", { step: "Searching the web for additional intelligence..." });
            const grStage = await safeStage<string>(
              'general_research',
              async () => {
                const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY");
                const searchItems: string[] = [];
                const searchQueries = intentResult.searchQueries.length > 0 ? intentResult.searchQueries : [message];

                for (const sq of searchQueries) {
                  if (ANTHROPIC_KEY) {
                    // CRITICAL_AWAIT_OK: live-crawl helper inside try/catch on fail-hard path
                    const searchResults = await claudeWebSearch(sq, 5);
                    let discoveredUrls: { title: string; url: string; snippet: string }[] = [];
                    for (const text of searchResults) {
                      const urlMatch = text.match(/https?:\/\/[^\s)\]]+/);
                      if (urlMatch?.[0]) {
                        discoveredUrls.push({ title: text.slice(0, 100), url: urlMatch[0], snippet: text.slice(0, 300) });
                      }
                    }

                    if (hasFirecrawlKey() && discoveredUrls.length > 0) {
                      const scrapePromises = discoveredUrls.slice(0, 3).map(async (item) => {
                        try {
                          // CRITICAL_AWAIT_OK: live-crawl helper inside try/catch on fail-hard path
                          const scrapeRes = await firecrawlFetch("https://api.firecrawl.dev/v1/scrape", {
                            method: "POST",
                            body: JSON.stringify({ url: item.url, formats: ["markdown"], onlyMainContent: true }),
                          });
                          if (scrapeRes.ok) {
                            // CRITICAL_AWAIT_OK: primary HTTP I/O on fail-hard path
                            const scrapeData = await scrapeRes.json();
                            const fullMarkdown = scrapeData.data?.markdown || scrapeData.markdown || "";
                            if (fullMarkdown.length > 50) {
                              item.snippet = fullMarkdown;
                              console.log(`General research: extracted ${fullMarkdown.length} chars from ${item.url}`);
                            }
                          }
                        } catch (e) { console.error(`Firecrawl scrape failed for ${item.url}:`, e); }
                      });
                      await Promise.all(scrapePromises);
                    }

                    for (const item of discoveredUrls) {
                      searchItems.push(`- "${item.title}" (${item.url})\n  ${item.snippet}`);
                    }
                  }
                }

                return searchItems.length > 0
                  ? `\n\n--- LIVE WEB RESEARCH RESULTS ---\n${searchItems.join("\n\n")}\n--- END RESEARCH ---`
                  : "";
              },
              "",
              { timeoutMs: 60_000 },
            );
            stageDiagnostics.push(grStage.diagnostics);
            if (grStage.value) {
              webIntel = webIntel ? webIntel + grStage.value : grStage.value;
            }
          }

          enterStage('prompt_assembly');
          const hasHistory = history && history.length > 0;
          const isFullProduct = category === "Full Product" && subCategory === "Full Product";
          let systemPrompt: string;
          let modelUsed: string;

          const productAreaDesc = getProductAreaDescription(category, subCategory);
          const productAreaContext = productAreaDesc
            ? `\n\nPRODUCT AREA DEFINITION: "${subCategory}" in Workday Adaptive Planning means:\n"${productAreaDesc}"\n\nUse this definition to ensure your analysis focuses on capabilities that directly map to this product area.\n`
            : "";

          const isMultiCompetitor = allCompetitors.length > 1;
          const competitorNames = allCompetitors.join(", ");
          const competitorLabel = allCompetitors.join(" vs ");

          const fullProductSections = isFullProduct ? `
Always structure your initial analysis with these sections (use ## for section headers):

## Executive Summary
## Reporting & Analytics Comparison
## Modeling & Architecture Comparison
## Intelligent Planning & AI Comparison
## Integration & Data Connectivity
## Collaboration & Workflow
## Specialized Planning Modules
## Overall Strengths vs Weaknesses
## Reference Links` : `
Always structure your initial analysis with these sections (use ## for section headers):

## Feature Capability Comparison
## Implementation & Architecture Differences
## AI Capabilities
## Integration Methods
## Performance & Scale
## Strengths vs Weaknesses
## Reference Links`;

          const multiCompetitorInstructions = isMultiCompetitor ? `
MULTI-COMPETITOR ANALYSIS: You are comparing ${competitorNames} against Workday Adaptive Planning SIMULTANEOUSLY.
- All comparison tables MUST include a column for EACH competitor plus Workday Adaptive Planning
- In Strengths vs Weaknesses, provide ### sub-sections for EACH competitor AND Workday Adaptive Planning
- Highlight where competitors differentiate from EACH OTHER, not just from Workday
- Include a brief head-to-head summary at the end comparing the competitors against each other
` : "";

          enterStage('doc_retrieval');
          const maxChunks = isFullProduct ? 15 : 6;

          const kbStage = await safeStage(
            'doc_retrieval.retrieveKnowledge',
            async () => retrieveKnowledge(
              { category, subCategory, competitor, query: message },
              maxChunks,
            ),
            { context: "", chunks: [] as any[] },
            { timeoutMs: 15_000 },
          );
          stageDiagnostics.push(kbStage.diagnostics);
          const { context: retrievedKnowledge, chunks } = kbStage.value;
          console.log(`Retrieved ${chunks.length} knowledge chunks${kbStage.degraded ? " [degraded]" : ""}`);

          // On-demand doc-library retrieval (Hybrid: FTS narrows → extractor pulls answer-bearing snippets).
          // Adaptive (current capability) and roadmap (future/unreleased) retrieval run in PARALLEL,
          // each independently wrapped in safeStage with the same 30s budget + inert fallback.
          const [docStage, roadmapStage] = await Promise.all([
            safeStage(
              'doc_retrieval.retrieveDocKnowledge',
              async () => retrieveDocKnowledge({
                query: message,
                competitor: competitorLabel || undefined,
                subCategory: !isFullProduct ? subCategory : undefined,
                maxChunks: isFullProduct ? 12 : 8,
                candidateLimit: 60,
                hybridExtract: true,
              }),
              { context: "", sources: [] as any[], hitCount: 0, mode: "fallback_inert" } as any,
              { timeoutMs: 30_000 },
            ),
            safeStage(
              'doc_retrieval.retrieveRoadmapKnowledge',
              async () => retrieveRoadmapKnowledge({
                query: message,
                competitor: competitorLabel || undefined,
                subCategory: !isFullProduct ? subCategory : undefined,
                maxChunks: isFullProduct ? 12 : 8,
                candidateLimit: 60,
                hybridExtract: true,
              }),
              { context: "", sources: [] as any[], hitCount: 0, mode: "fallback_inert" } as any,
              { timeoutMs: 30_000 },
            ),
          ]);
          stageDiagnostics.push(docStage.diagnostics);
          stageDiagnostics.push(roadmapStage.diagnostics);
          const docKnowledge = docStage.value;
          const roadmapKnowledge = roadmapStage.value;
          console.log(
            `Retrieved ${docKnowledge.sources.length}/${docKnowledge.hitCount} doc chunks ` +
            `[mode=${docKnowledge.mode}] (${docKnowledge.sources.map((s: any) => s.doc).join(", ")})${docStage.degraded ? " [degraded]" : ""}`
          );
          console.log(
            `Retrieved ${roadmapKnowledge.sources.length}/${roadmapKnowledge.hitCount} roadmap chunks ` +
            `[mode=${roadmapKnowledge.mode}] (${roadmapKnowledge.sources.map((s: any) => s.doc).join(", ")})${roadmapStage.degraded ? " [degraded]" : ""}`
          );
          exitStage('doc_retrieval');

          const followUpInstruction = hasHistory ? `

IMPORTANT: The user is asking a follow-up question. Answer their SPECIFIC question directly — do NOT regenerate the full structured analysis. Use the context below to inform your answer but keep the response focused and concise.` : "";

          // Sheet-provided facts (XLSX knowledge base) — authoritative ground truth
          // CRITICAL_AWAIT_OK: competitor profile lookup inside try/catch
          const sheetProfiles = await getProfilesByNames(allCompetitors);
          const sheetFactsBlock = formatProfilesForPrompt(sheetProfiles);
          if (sheetProfiles.length > 0) {
            console.log(`SHEET-PROVIDED FACTS injected for ${sheetProfiles.length}/${allCompetitors.length} competitors`);
          }

          // Community signals are MANDATORY whenever items exist for the resolved
          // competitor(s). The availability signal already lives on feedEvidence;
          // we thread it to the prompt (here) and the contract (T4) — no new
          // infrastructure, just branching on existing data.
          const hasCommunityItems = feedEvidence.communityItems.length > 0;
          const communityMandate = hasCommunityItems
            ? `
COMMUNITY SENTIMENT (MANDATORY — community items are available for ${competitorLabel || "the competitor(s)"}):
- The INTELLIGENCE BRIEF contains a "## COMMUNITY SIGNALS" block with real user/community discussion items.
- You MUST include a "## Community Sentiment" section that synthesizes those signals — user opinions, complaints, praise, reviews, and recurring themes — and cite each item's source_url with markdown links.
- Do NOT omit this section and do NOT replace it with a generic disclaimer. Summarize what the community is actually saying.`
            : "";

          systemPrompt = `You are a Competitive Intelligence Analyst specializing in enterprise FP&A and EPM software, with deep expertise in Workday Adaptive Planning. You also excel at general company research.

Your role: Generate structured, factual competitive breakdowns comparing ${competitorLabel || "competitors"} against Workday Adaptive Planning${isFullProduct ? " as a complete product across all major capability areas" : ` in the ${subCategory} capability area (${category})`}.
${multiCompetitorInstructions}${productAreaContext}${followUpInstruction}

${sheetFactsBlock ? sheetFactsBlock + "\n" : ""}
${retrievedKnowledge ? `--- WORKDAY ADAPTIVE PLANNING — INTERNAL CAPABILITY FACTS ---\n${retrievedKnowledge}\n--- END INTERNAL CAPABILITY FACTS ---` : ""}
${docKnowledge.context ? `--- ADAPTIVE PLANNING — DOC LIBRARY EXCERPTS ---\n(Authoritative excerpts from Workday Adaptive Planning documentation, formula reference, release notes, and glossary. Use these as ground truth when comparing against competitors.)\n${docKnowledge.context}\n--- END DOC LIBRARY EXCERPTS ---` : ""}
${roadmapKnowledge.context ? `--- ROADMAP ITEMS (FUTURE / NOT YET RELEASED) ---\n(These passages describe PLANNED / UNRELEASED Workday Adaptive Planning capability. They are NOT current product state. Each passage is tagged [roadmap: …]. See the ROADMAP TAGGING RULE below — any sentence you derive from these MUST end with "(roadmap)".)\n${roadmapKnowledge.context}\n--- END ROADMAP ITEMS ---` : ""}


${webIntel ? `--- INTELLIGENCE BRIEF ---\n${webIntel}\n--- END BRIEF ---` : ""}
${!hasHistory ? fullProductSections : ""}

CRITICAL OUTPUT RULES:
- ROADMAP TAGGING RULE (HARD RULE): Some of your evidence is tagged as ROADMAP (passages tagged [roadmap: …] under "ROADMAP ITEMS (FUTURE / NOT YET RELEASED)"). This evidence describes future / unreleased product capability for Adaptive Planning, NOT current state. For EVERY sentence you derive from roadmap evidence you MUST do BOTH of the following: (1) cite the roadmap source inline with a [roadmap: source] marker — exactly the same way you cite normal evidence with [Source: …]; and (2) end that same sentence with the user-visible "(roadmap)" suffix. A sentence that uses roadmap content but is missing either the [roadmap: …] citation or the "(roadmap)" suffix is a contract violation. Do NOT mix roadmap content into a sentence that also describes current capability — split it into separate sentences, and only the roadmap sentence carries the [roadmap: …] citation and the "(roadmap)" suffix.
- Synthesize ALL available intelligence into comprehensive findings. Present what you know confidently and note gaps briefly.
- NEVER output empty tables, placeholder frameworks, or "what to look for" templates. Every table cell must contain actual data.
- NEVER ask "which company do you mean?" — research the most likely match and state your assumption. If ambiguous, note which company you researched.
- Use "Not found" ONLY when you have absolutely zero information for a specific field. If you have partial data, present it and note what's missing.
- NEVER punt research to the user. Do NOT say "try searching for...", "you can find this at...", or "check LinkedIn for...". YOU are the researcher — present your findings definitively.
- If scraped website content is available, extract and present ALL useful information from it (product description, features, team, pricing, integrations, etc.).

SCOPE GUARDRAIL (CRITICAL):
- Your domain is competitive intelligence for **financial planning, workforce planning, FP&A, EPM/CPM, accounting, consolidation, treasury, and adjacent enterprise finance software**.
- Decline (briefly, professionally) to research companies, products, or topics with no plausible connection to that domain. Example refusal: "That topic is outside the FP&A/EPM scope I cover. Try asking about a planning vendor or capability."
- Vendors present in the SHEET-PROVIDED FACTS block above are IN scope by definition — research them fully.

GENERAL RESEARCH CAPABILITY (within FP&A/EPM scope only):
- Answer questions about company leadership (CEO, CTO, founders), LinkedIn profiles, and backgrounds
- Provide funding round details, revenue estimates, valuations, and investor information
- Determine company size/segment (mid-market, enterprise, SMB, employee count)
- Research market size, TAM, and industry positioning
- Find information about acquisitions, partnerships, and strategic moves
- Always cite sources when using live research results

FORMATTING RULES (CRITICAL — follow precisely):
- Use markdown tables (with | delimiters) for comparisons
- Use ## for major section headers
- Use ### for sub-section headers
- NEVER put section headers or sub-headers as bullet points
- Use plain text paragraphs for descriptions
- Use bullet lists (starting with -) ONLY for actual enumerated content items
- Always include full URLs as plain text so they can be hyperlinked
- Be factual
- NEVER include system disclaimers, AI self-references, or technical limitation notes
- Avoid marketing language
- When citing research results, use markdown link syntax [Source](URL)
- CITATION DEPTH (CRITICAL): every URL you cite MUST include a non-trivial page path (e.g. https://example.com/features or /pricing). Domain-only links like https://example.com/ are NOT valid evidence and will be rejected. Pull deep paths from the INTELLIGENCE BRIEF above (look for "[Sheet-priority crawl: <url>]" markers).
- EMPTY CITATIONS FORBIDDEN: NEVER emit "[Source]()", "[Source]( )", or any markdown link with an empty/whitespace-only URL. If you don't have a real deep URL for a claim, omit the citation entirely. Empty source placeholders will be stripped and counted as a quality failure.
- ADAPTIVE PLANNING VOICE: When citing Workday Adaptive Planning capabilities, state them as established facts (e.g. "Adaptive Planning supports X"). NEVER use phrases like "per provided reference knowledge", "per the reference", "per provided knowledge", "according to the provided reference", or any meta-reference to the source of Adaptive Planning information.
- SOURCES SCOPE: The "## Sources" and any "## Reference Links" section must list ONLY article/blog/doc URLs. NEVER place image, screenshot, or video URLs (YouTube, Vimeo, Wistia, Loom, .png, .jpg, .webp, /storage/v1/object/public/, competitor-screenshots) in those sections — those belong only in Visual Overview.
- FEED EVIDENCE PRIORITY: When a "## FEED-CURATED NEWS" or "## COMMUNITY SIGNALS" block is present in the INTELLIGENCE BRIEF, treat those items as the primary evidence for recency, announcements, sentiment, reviews, and "what's the latest" questions. They are pre-curated, dated, and source-attributed — cite their source_url directly rather than re-stating without a link.
- End every substantive response with a "## Sources" section listing the deep URLs you cited.
${communityMandate}
${!hasHistory ? `
RESPONSE STRUCTURE (MANDATORY):
1. FIRST: Executive Summary
2. THEN: Detailed comparison sections with tables
3. LAST: Reference Links

VISUAL MEDIA HANDLING (CRITICAL):
- A "Visual Overview" gallery of screenshots and videos is gathered by a SEPARATE media pipeline and rendered automatically alongside your response. You do NOT author it.
- Do NOT write a "## Visual Overview" section, and do NOT emit any image markdown (![alt](url)) or video tokens ([VIDEO: ...](url)). Any media URLs you emit will be stripped from the prose.
- If a specific screenshot or video is needed to support a claim and it is NOT already in the "RETRIEVED VISUAL EVIDENCE" list (if present below), emit a control token on its own line: <<NEEDS_MEDIA: short entity or description>>. The media pipeline will fetch it on-demand and surface it in the gallery. Use sparingly.` : `
Do NOT include a Visual Overview section or media/image markdown in follow-up responses unless specifically asked. To pull a specific image/video into the gallery, emit <<NEEDS_MEDIA: description>> on its own line.`}

IMPORTANT: Never expose internal adaptive planning data or proprietary information.`;

          // ---------------------- D3: Evidence Manifest ----------------------
          // Extract every (title, url) pair from mediaContext so the synthesizer
          // SEES the visual evidence the user is rendering inline. Without this,
          // the LLM writes "details not evidenced" while we display the proof.
          //
          // Format expected in mediaContext lines:
          //   ![Title or alt text](https://host/path/file.png)
          //   - https://host/path/file.png  (Title)  (from https://host/page)
          // We pull both image URLs and their (from <source-page>) URLs and
          // dedupe by source-page URL (the deep article/doc URL is what the
          // synthesizer should cite, not the screenshot CDN URL).
          const evidenceManifest: { title: string; url: string; slug: string }[] = [];
          if (mediaContext) {
            const seenUrls = new Set<string>();
            const slugify = (raw: string) => {
              try {
                const u = new URL(raw);
                const lastSeg = u.pathname.split("/").filter(Boolean).pop() || u.hostname;
                return lastSeg.replace(/\.[a-z0-9]{2,5}$/i, "").replace(/[^a-z0-9-_]+/gi, "-").toLowerCase();
              } catch { return raw.slice(-40); }
            };
            // Pattern A: markdown image with following (from URL) marker
            const imgRe = /!\[([^\]]*)\]\(([^)]+)\)(?:\s*\(from\s+(https?:\/\/[^)\s]+)\))?/g;
            for (const m of mediaContext.matchAll(imgRe)) {
              const title = (m[1] || "").trim() || "Untitled";
              const sourceUrl = (m[3] || m[2]).replace(/[.,;:!?)]+$/, "");
              if (!sourceUrl || seenUrls.has(sourceUrl)) continue;
              seenUrls.add(sourceUrl);
              evidenceManifest.push({ title: title.slice(0, 120), url: sourceUrl, slug: slugify(sourceUrl) });
              if (evidenceManifest.length >= 30) break;
            }
            // Pattern B: bare "(from URL)" markers without preceding image (gallery-only)
            if (evidenceManifest.length < 30) {
              const fromRe = /\(from\s+(https?:\/\/[^)\s]+)\)/g;
              for (const m of mediaContext.matchAll(fromRe)) {
                const sourceUrl = m[1].replace(/[.,;:!?)]+$/, "");
                if (!sourceUrl || seenUrls.has(sourceUrl)) continue;
                seenUrls.add(sourceUrl);
                evidenceManifest.push({ title: "Source page", url: sourceUrl, slug: slugify(sourceUrl) });
                if (evidenceManifest.length >= 30) break;
              }
            }
          }

          if (evidenceManifest.length > 0) {
            // Never expose raw screenshot/CDN/image URLs to the synthesizer. When
            // it sees a media URL it echoes it back as `![title](url)` image
            // markdown into the PROSE stream — redundant media (the gallery
            // already has it from the media channel) that also drives the
            // media-in-prose render hazards. Show the TITLE only for media/CDN
            // URLs (the model can still cite the capability as an observed fact);
            // keep real article/source URLs so citations still work.
            const isMediaCdnUrl = (u: string) =>
              /\.(?:png|jpe?g|gif|webp|svg|mp4|webm|mov|ogg)(?:\?|$)/i.test(u) ||
              /\/storage\/v1\/object\/public\//.test(u) ||
              /competitor-screenshots/.test(u);
            const manifestBlock = evidenceManifest
              .slice(0, 20)
              .map((e) => (isMediaCdnUrl(e.url) ? `- ${e.title}` : `- [${e.title}] ${e.url}`))
              .join("\n");
            systemPrompt += `

## RETRIEVED VISUAL EVIDENCE (already shown to user inline)
${manifestBlock}

EVIDENCE UTILIZATION RULES (CRITICAL):
- The items above are evidence the user can SEE in the Visual Overview gallery (rendered separately). You MUST treat them as observed facts. NEVER write them back as image markdown — the gallery already shows them.
- If a title clearly demonstrates a capability (e.g. "XL Reporting Services"), do NOT write "specific details not evidenced" or "no public information" for that capability — acknowledge what the visual evidence shows.
- If you genuinely need the full text content of one of these pages to support a specific claim, emit at most 3 control tokens of the form: <<NEEDS_SCRAPE: https://full-url>> on their own lines at the END of your response. The orchestrator will scrape those pages and re-invoke you with the deep content. Use this sparingly — only when a claim cannot be made without the page body.`;
          }

          modelUsed = "openai/gpt-5.5";

          const sanitizedHistory = (history || []).filter(
            (msg: any) => msg && typeof msg.content === "string" && msg.content.trim() !== ""
          );
          const aiMessages = [
            { role: "system", content: systemPrompt },
            ...sanitizedHistory,
            { role: "user", content: message || "Provide a comprehensive competitive analysis." },
          ];

          const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

          exitStage('prompt_assembly');
          sendEvent("progress", { step: "AI model generating response..." });

          // CRITICAL_AWAIT_OK: primary LLM generation — fail-hard by design
          const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${LOVABLE_API_KEY}` },
            body: JSON.stringify({ model: modelUsed, messages: aiMessages, stream: true }),
          });

          if (!response.ok) {
            // CRITICAL_AWAIT_OK: primary HTTP I/O on fail-hard path
            const errText = await response.text();
            console.error("AI gateway error:", response.status, errText);

            const latencyMs = Date.now() - traceStartTime;
            supabaseService.from("agent_traces").insert({
              user_id: user.id, thread_id: threadId || null, category, sub_category: subCategory,
              competitor_name: competitor, system_prompt: systemPrompt, user_prompt: message,
              retrieved_documents: retrievedDocs, tool_calls: toolCallsLog,
              model_used: modelUsed, status: "error", error_message: `AI gateway error: ${response.status}`,
              latency_ms: latencyMs, trace_type: 'conversation', agent_source: 'comp_agent',
              prompt_tokens: null, completion_tokens: null, total_tokens: null,
            }).then(() => {}, () => {});

            if (response.status === 429) sendEvent("error", { content: "Rate limit exceeded. Please try again in a moment." });
            else if (response.status === 402) sendEvent("error", { content: "Usage credits exhausted. Please add credits." });
            else sendEvent("error", { content: `AI gateway error (${response.status}). Please try again.` });
            clearInterval(keepalive);
            controller.close();
            return;
          }

          // Stream tokens
          let fullContent = "";
          let usage: any = {};
          const reader = response.body?.getReader();
          const decoder = new TextDecoder();
          let streamBuffer = "";

          if (reader) {
            while (true) {
              // CRITICAL_AWAIT_OK: SSE stream loop — fail-hard by design
              const { done, value } = await reader.read();
              if (done) break;
              streamBuffer += decoder.decode(value, { stream: true });
              let newlineIndex: number;
              while ((newlineIndex = streamBuffer.indexOf("\n")) !== -1) {
                let line = streamBuffer.slice(0, newlineIndex);
                streamBuffer = streamBuffer.slice(newlineIndex + 1);
                if (line.endsWith("\r")) line = line.slice(0, -1);
                if (!line.startsWith("data: ")) continue;
                const jsonStr = line.slice(6).trim();
                if (jsonStr === "[DONE]") break;
                try {
                  const parsed = JSON.parse(jsonStr);
                  const delta = parsed.choices?.[0]?.delta?.content;
                  if (delta) { fullContent += delta; sendEvent("token", { token: delta }); }
                  if (parsed.usage) usage = parsed.usage;
                } catch { streamBuffer = line + "\n" + streamBuffer; break; }
              }
            }
          }

          // Flush remaining
          if (streamBuffer.trim()) {
            for (let raw of streamBuffer.split("\n")) {
              if (!raw) continue;
              if (raw.endsWith("\r")) raw = raw.slice(0, -1);
              if (!raw.startsWith("data: ")) continue;
              const jsonStr = raw.slice(6).trim();
              if (jsonStr === "[DONE]") continue;
              try {
                const parsed = JSON.parse(jsonStr);
                const delta = parsed.choices?.[0]?.delta?.content;
                if (delta) { fullContent += delta; sendEvent("token", { token: delta }); }
                if (parsed.usage) usage = parsed.usage;
              } catch {}
            }
          }

          let content = fullContent || "Unable to generate analysis. Please try again.";

          // Sanitize disclaimers (still needed regardless of pipeline path —
          // these patterns are about model voice, not source handling).
          const disclaimerPatterns = [
            /I don['']t have (?:access|real-time access) to[^.]*\./gi,
            /I(?:'m| am) unable to (?:access|retrieve|browse|verify)[^.]*\./gi,
            /I cannot (?:access|browse|retrieve|verify)[^.]*\./gi,
            /As an AI,? I (?:don['']t|cannot|can['']t)[^.]*\./gi,
            /I don['']t have the ability to[^.]*\./gi,
            /(?:Please )?note(?::| that) (?:I am|I'm|this is) (?:an? )?(?:AI|language model|assistant)[^.]*\./gi,
            /(?:As )?(?:an? )?(?:AI|language model),? I[^.]*\./gi,
            /I should (?:note|mention|point out|clarify) that[^.]*(?:AI|model|assistant|limitation|access|real-time)[^.]*\./gi,
            /\*\*(?:Note|Disclaimer|Important Note)\*\*:?\s*[^.]*(?:AI|model|access|limitation|verify|real-time)[^.]*\./gi,
            /⚠️[^.]*(?:AI|access|limitation|disclaimer)[^.]*\./gi,
            /\[(?:Note|System|Internal)\]:?\s*[^.]*\./gi,
          ];
          for (const pattern of disclaimerPatterns) {
            content = content.replace(pattern, "").trim();
          }

          // Strip "per provided reference knowledge" meta-references.
          const adaptiveMetaRefPatterns = [
            /\s*\(?\s*per\s+(?:the\s+)?(?:provided\s+)?(?:reference\s+)?knowledge\s*\)?/gi,
            /\s*\baccording to (?:the )?(?:provided )?reference(?:\s+knowledge)?\b/gi,
            /\s*\bas (?:per|stated in) (?:the )?(?:provided )?reference(?:\s+knowledge)?\b/gi,
            /\s*\(?\s*per\s+(?:the\s+)?internal\s+capability\s+facts\s*\)?/gi,
          ];
          for (const pattern of adaptiveMetaRefPatterns) {
            content = content.replace(pattern, "");
          }

          // ---------------------- D3: NEEDS_SCRAPE escape hatch ----------------------
          // If the synthesizer emitted <<NEEDS_SCRAPE: url>> tokens, scrape those
          // pages once via firecrawl-scrape and re-invoke synthesis with the deep
          // content appended. Cap at 3 URLs and 1 round to bound cost/latency.
          let evidenceRescrape: { requested: number; scraped: number; round: number } = { requested: 0, scraped: 0, round: 0 };
          {
            const SCRAPE_TOKEN_RE = /<<\s*NEEDS_SCRAPE\s*:\s*(https?:\/\/[^\s>]+)\s*>>/gi;
            const requested = [...content.matchAll(SCRAPE_TOKEN_RE)].map((m) => m[1].replace(/[.,;:!?)]+$/, ""));
            const uniqueRequested = Array.from(new Set(requested)).slice(0, 3);
            evidenceRescrape.requested = uniqueRequested.length;

            // Strip the tokens from the visible draft regardless of whether we re-synthesize.
            content = content.replace(SCRAPE_TOKEN_RE, "").trim();

            if (uniqueRequested.length > 0) {
              sendEvent("progress", { step: `Deep-scraping ${uniqueRequested.length} cited page(s)...` });
              const scrapeResults = await Promise.all(uniqueRequested.map(async (url) => {
                try {
                  const r = await safeStage(
                    `evidence_rescrape:${url.slice(0, 60)}`,
                    async () => {
                      const { data, error } = await supabaseService.functions.invoke("firecrawl-scrape", {
                        body: { url, options: { formats: ["markdown"], onlyMainContent: true } },
                      });
                      if (error) throw new Error(error.message);
                      const md = (data?.data?.markdown || data?.markdown || "").toString().slice(0, 4000);
                      return md ? { url, md } : null;
                    },
                    null as null | { url: string; md: string },
                    { timeoutMs: 30_000 },
                  );
                  return r.value;
                } catch { return null; }
              }));
              const scraped = scrapeResults.filter((x): x is { url: string; md: string } => !!x);
              evidenceRescrape.scraped = scraped.length;

              if (scraped.length > 0) {
                evidenceRescrape.round = 1;
                const deepBlock = scraped.map((s) => `### ${s.url}\n${s.md}`).join("\n\n---\n\n");
                const rescrapeMessages = [
                  { role: "system", content: systemPrompt + `\n\n## DEEP-SCRAPED EVIDENCE\n${deepBlock}\n\nUse the deep-scraped evidence above to revise the draft below. Preserve everything that is correct; remove or correct any "not evidenced" claims that the new evidence resolves. Return the FULL revised response.` },
                  { role: "user", content: `Original user prompt: ${message}\n\nPrevious draft to revise:\n\n${content.slice(0, 14000)}` },
                ];
                try {
                  const rescrapeRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
                    method: "POST",
                    headers: { "Content-Type": "application/json", Authorization: `Bearer ${Deno.env.get("LOVABLE_API_KEY")}` },
                    body: JSON.stringify({ model: modelUsed, messages: rescrapeMessages, max_completion_tokens: 20000 }),
                  });
                  if (rescrapeRes.ok) {
                    const rj = await rescrapeRes.json();
                    const revised = (rj.choices?.[0]?.message?.content || "").trim();
                    if (revised && revised.length >= content.length * 0.5) {
                      content = revised;
                      // Do NOT emit an interim `content` event here: it carries no
                      // messageId, so the client would treat it as finalization
                      // (legacy insert path → nulls streamingBubbleId), and the
                      // authoritative final `content` event would then find no
                      // bubble to promote and insert a DUPLICATE row. The revised
                      // draft flows into the single final `content` event below.
                      console.log(`[evidence_rescrape] applied revision (${scraped.length} URLs, ${revised.length} chars)`);
                    }
                  }
                } catch (e) {
                  console.error("[evidence_rescrape] re-synthesis failed:", e);
                }
              }
            }
          }

          // ---------------------- NEEDS_MEDIA token strip ----------------------
          // The synthesizer may emit <<NEEDS_MEDIA: query>> tokens. Strip them
          // from the VISIBLE prose now (cheap, deterministic). The actual
          // on-demand gather — like the slow media phase and the Visual Overview
          // reconstruction — runs in the BACKGROUND task after the stream closes,
          // so NOTHING media-bound gates the prose-done signal (`content`/`done`).
          // This is the root-cause fix for the "stuck at the end" stall: media
          // finalization is no longer on the critical path between the last token
          // and stream close (see SSE CONTRACT above).
          const MEDIA_TOKEN_RE = /<<\s*NEEDS_MEDIA\s*:\s*([^>]+?)\s*>>/gi;
          const needsMediaRequests = Array.from(new Set(
            [...content.matchAll(MEDIA_TOKEN_RE)].map((m) => m[1].trim()).filter(Boolean),
          )).slice(0, 3);
          content = content.replace(MEDIA_TOKEN_RE, "").trim();

          // allowedMediaUrls from the media gathered SO FAR (fast phase). The
          // synthesizer no longer authors media, so this only guards stray URLs;
          // the canonical gallery is reconstructed in the background.
          const allowedMediaUrls = new Set<string>();
          if (mediaContext) {
            for (const match of mediaContext.matchAll(/https?:\/\/[^\s)]+/g)) {
              allowedMediaUrls.add(match[0].replace(/\?.*$/, ""));
            }
          }

          // ---------- Build the source registry (used by V2 finalization) ----------
          // (probe removed — flat-shared layout deployed)
          const registry = new EvidenceSourceRegistry();
          if (webIntel) {
            const urls = (webIntel.match(/https?:\/\/[^\s)\]"]+/gi) || []);
            for (const u of urls.slice(0, 60)) {
              const clean = u.replace(/[.,;:!?)]+$/, "");
              try {
                const path = new URL(clean).pathname;
                if (path && path !== "/" && path.length > 1) {
                  registry.register({ kind: "web", url: clean });
                }
              } catch { /* skip */ }
            }
          }
          if (mediaContext) {
            for (const fm of mediaContext.matchAll(/\(from\s+(https?:\/\/[^)\s]+)\)/g)) {
              const clean = fm[1].replace(/[.,;:!?)]+$/, "");
              try {
                const path = new URL(clean).pathname;
                if (path && path !== "/" && path.length > 1) {
                  registry.register({ kind: "media_source_page", url: clean });
                }
              } catch { /* skip */ }
            }
          }
          for (const u of feedEvidence.urls) {
            registry.register({ kind: "feed", url: u });
          }
          for (const s of docKnowledge.sources) {
            registry.register({
              kind: "doc",
              docRef: `${s.doc}${s.section ? ` › ${s.section}` : ""}`,
              title: s.title ?? undefined,
            });
          }

          let finalizeDiag: Record<string, unknown> | undefined;

          // Structured finalization (V2 — sole path).
          // Whitespace + remaining cleanup in one deterministic, side-effect-free pass.
          content = content.replace(/[ \t]{2,}/g, " ").replace(/[ \t]+([.,;:!?])/g, "$1");

          // NOTE: the canonical "## Visual Overview" is NOT reconstructed here.
          // It is built in the BACKGROUND task (after stream close) from the final
          // media set and embedded into the PERSISTED content only — keeping media
          // finalization off the prose-done critical path. The LIVE client renders
          // the gallery from the `media` SSE channel (fast phase, already sent);
          // reload re-derives it from the persisted content. `content` here is
          // prose-only.

          const finalized = finalizeResponse({
            markdown: content,
            registry,
            allowedMediaUrls,
            appendCanonicalSources: true,
          });
          content = finalized.markdown;
          finalizeDiag = finalized.diagnostics as unknown as Record<string, unknown>;


          // ===== RESPONSE CONTRACT GATE =====
          // Run the contract synchronously: validate, repair (if needed), and
          // judge with retries. Replaces the prior fire-and-forget judge call
          // and eliminates the silent-null judge_scores class entirely.
          // Extract deep crawled URLs from the intelligence brief so the citation
          // repair can substitute domain-only links with real evidence paths.
          const crawledUrlSet = new Set<string>();
          if (webIntel) {
            const urls = (webIntel.match(/https?:\/\/[^\s)\]"]+/gi) || []);
            for (const u of urls) {
              const clean = u.replace(/[.,;:!?)]+$/, "");
              try {
                const path = new URL(clean).pathname;
                if (path && path !== "/" && path.length > 1) crawledUrlSet.add(clean);
              } catch { /* skip invalid */ }
              if (crawledUrlSet.size >= 24) break;
            }
          }
          // Always include feed-curated URLs (deep, dated, source-attributed)
          for (const u of feedEvidence.urls) {
            crawledUrlSet.add(u);
            if (crawledUrlSet.size >= 32) break;
          }
          // For gallery-only competitors (where we skip live crawling) the
          // mediaContext still carries `(from <source-page-url>)` markers — pull
          // those deep article/blog URLs in so the deterministic citation
          // repair has something to work with.
          if (mediaContext) {
            const fromMatches = mediaContext.matchAll(/\(from\s+(https?:\/\/[^)\s]+)\)/g);
            for (const fm of fromMatches) {
              const clean = fm[1].replace(/[.,;:!?)]+$/, "");
              try {
                const path = new URL(clean).pathname;
                if (path && path !== "/" && path.length > 1) crawledUrlSet.add(clean);
              } catch { /* skip */ }
              if (crawledUrlSet.size >= 48) break;
            }
          }
          // Response contract runs as a non-critical safeStage. If it throws
          // or times out, the user still gets the (already-finalized) content
          // and the trace records a failed_soft signal — no more silent crashes
          // killing the entire response.
          // stageDiagnostics is hoisted at the top of the try block so the
          // outer catch can serialize partial progress.
          const contractStage = await safeStage(
            "response_contract",
            () => runResponseContract(
              content,
              message || "",
              {
                competitor: competitor || "",
                category,
                subCategory,
                crawledUrls: [...crawledUrlSet],
                evidenceManifest: typeof evidenceManifest !== "undefined" ? evidenceManifest : [],
                comparisonHostnames: (allCompetitors || [])
                  .map((c) => c.toLowerCase().replace(/\s+/g, "").replace(/[^a-z0-9-]/g, ""))
                  .filter((h) => h.length > 1)
                  .map((h) => `${h}.com`),
                communityItemsAvailable: feedEvidence.communityItems.length > 0,
              },
              // Critical path: deterministic repair only (instant). Judge runs
              // off-path in the background task below so it never gates stream close.
              { preComputedIntent: queryIntent, skipJudge: true },
            ),
            // Inert fallback: keep the finalized content as-is, no scores, no repairs.
            {
              final: content,
              intent: queryIntent,
              violations: [],
              repairs: [],
              repairLog: [],
              verdict: "skipped" as const,
              scores: null,
              judgeFailureReason: "stage_failed_soft",
            } as unknown as Awaited<ReturnType<typeof runResponseContract>>,
            { timeoutMs: 120_000 },
          );
          stageDiagnostics.push(contractStage.diagnostics);
          const contractResult = contractStage.value;

          // If repair changed the content, use the repaired version going forward
          const finalContent = contractResult.final;

          // Pre-generate IDs so the client can finalize its bubble without a
          // DB round-trip. The server persists both rows in the background.
          const messageId = crypto.randomUUID();
          const traceId = crypto.randomUUID();

          // Prose-done signal — fully DECOUPLED from media finalization. This is
          // what flips `isStreaming=false` on the client (spinner off, action/
          // feedback row on). It fires immediately after the deterministic
          // contract (ms), NEVER behind the slow media await. `content` is
          // prose-only; `media` carries the FAST-phase gallery (gathered before/
          // during synthesis) so the live gallery is already populated. The full
          // gallery (slow crawls + on-demand) is reconstructed into the persisted
          // content by the background task and shows on reload.
          sendEvent("content", { content: finalContent, messageId, media: mediaItemsForClient });
          sendEvent("metadata", { traceId });
          const degradedStages = stageDiagnostics.filter((s) => s.status === "failed_soft").map((s) => s.name);
          if (degradedStages.length > 0) {
            sendEvent("metadata", { degradedStages });
          }
          // Judge scores are no longer computed on the critical path — they are
          // produced and persisted by the background task below. The Agent Traces
          // UI / eval chip reads them from the DB once the background write lands.
          sendEvent("done", {});

          // Everything below runs after the stream is closed — off the
          // user's critical path. The browser tab is free.
          const latencyMs = Date.now() - traceStartTime;
          queueBackgroundTask((async () => {
            // 0) MEDIA FINALIZATION (moved off the critical path). Await the slow
            // media phase (live crawls + quality gate) that ran in parallel with
            // synthesis, run any on-demand <<NEEDS_MEDIA>> gathers, then build the
            // canonical "## Visual Overview" and embed it into the PERSISTED
            // content. This is what reload / doc export / the judge read; the live
            // client already showed the fast-phase gallery via the `media` channel.
            // Because this runs AFTER controller.close(), a large gallery quality
            // gate can never stall the user's stream.
            if (fullMediaPromise) {
              try {
                const fullMedia = await fullMediaPromise;
                mediaContext = fullMedia.mediaContext;
                mediaItemsForClient = fullMedia.items;
                galleryResultsOuter = fullMedia.galleryResults;
                liveCrawlMetadataOuter = fullMedia.liveCrawlMetadata;
                for (const m of fullMedia.liveCrawlMetadata) {
                  if (m.mediaCount > 0) toolCallsLog.push({ tool: "runTargetedLiveCrawl", competitor: m.comp, mediaCount: m.mediaCount });
                }
              } catch (e) {
                console.error("Awaiting full media failed; using fast media:", e);
              }
            }

            // On-demand media (the <<NEEDS_MEDIA: query>> seam), scoped per query.
            if (needsMediaRequests.length > 0 && allCompetitors.length > 0) {
              const seen = new Set<string>(mediaItemsForClient.map((i) => mediaDedupeKey(i.url)));
              const onDemandItems: MediaItemPayload[] = [];
              const onDemandResults = await Promise.all(
                needsMediaRequests.map((q) =>
                  gatherOnDemandMedia(q, allCompetitors, category, subCategory).catch((e) => {
                    console.error("gatherOnDemandMedia failed:", e);
                    return { mediaContext: "", items: [] as MediaItemPayload[] };
                  }),
                ),
              );
              for (const r of onDemandResults) {
                for (const item of r.items) {
                  const key = mediaDedupeKey(item.url);
                  if (seen.has(key)) continue;
                  seen.add(key);
                  onDemandItems.push(item);
                }
                if (r.mediaContext) {
                  mediaContext = mediaContext
                    ? `${mediaContext}\n--- ON-DEMAND MEDIA ---\n${r.mediaContext}\n--- END ON-DEMAND MEDIA ---`
                    : r.mediaContext;
                }
              }
              if (onDemandItems.length > 0) {
                mediaItemsForClient = [...mediaItemsForClient, ...onDemandItems];
                toolCallsLog.push({ tool: "gatherOnDemandMedia", requests: needsMediaRequests, added: onDemandItems.length });
              }
            }

            // Reconstruct the canonical Visual Overview from the final media set
            // and prepend it to the prose. `persistedContent` is the single
            // source of truth for media on reload / export / judge.
            let persistedContent = finalContent;
            if (mediaContext) {
              const mediaUrls = [...mediaContext.matchAll(/https?:\/\/[^\s)]+/g)].map((m) => m[0]);
              const mediaLines = mediaContext.split("\n");
              const allMediaTokens: string[] = [];
              const seenUrls = new Set<string>();
              for (const url of mediaUrls) {
                const isImageUrl = /\.(?:png|jpe?g|gif|webp|svg)(?:\?|$)/i.test(url) || url.includes("competitor-screenshots");
                const isVideo = !isImageUrl && (
                  url.includes("youtube.com/watch") || url.includes("youtu.be/") ||
                  url.includes("vimeo.com/") || url.includes("wistia.com/") ||
                  url.includes("vidyard.com/") || url.includes("loom.com/") ||
                  /\.(?:mp4|webm|mov|ogg)(?:\?|$)/i.test(url)
                );
                if (!isImageUrl && !isVideo) continue;
                const dedupeKey = mediaDedupeKey(url);
                if (seenUrls.has(dedupeKey)) continue;
                seenUrls.add(dedupeKey);
                const refLine = mediaLines.find((l) => l.includes(url));
                let desc = refLine ? refLine.replace(/\[.*?\]\s*/, "").replace(url, "").replace(/[:\s]+$/, "").trim() : "";
                const fromMatch = desc.match(/\(from\s+(https?:\/\/[^)]+)\)/);
                const sourcePageUrl = fromMatch ? fromMatch[1] : "";
                desc = desc.replace(/\(from[^)]*\)/g, "").trim();
                desc = desc || `${competitor || allCompetitors[0] || "Competitor"} product`;
                const token = isVideo
                  ? `[VIDEO: ${desc}](${url})`
                  : sourcePageUrl
                    ? `![${desc}](${url} "${sourcePageUrl}")`
                    : `![${desc}](${url})`;
                allMediaTokens.push(token);
              }
              allMediaTokens.sort((a, b) => {
                const aIsCrawled = a.includes("competitor-screenshots") ? 0 : 1;
                const bIsCrawled = b.includes("competitor-screenshots") ? 0 : 1;
                return aIsCrawled - bIsCrawled;
              });
              if (allMediaTokens.length > 0) {
                let body = finalContent.replace(/## Visual Overview\s*\n[\s\S]*?(?=\n## )/, "").trim();
                for (const url of mediaUrls) {
                  const escapedUrl = url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
                  body = body.replace(new RegExp(`!\\[[^\\]]*\\]\\(${escapedUrl}\\)`, "g"), "");
                  body = body.replace(new RegExp(escapedUrl, "g"), "");
                }
                body = body.replace(/\n{3,}/g, "\n\n").trim();
                persistedContent = `## Visual Overview\n\n${allMediaTokens.join("\n\n")}\n\n${body}`;
              }
            }

            try {
              // 1) Persist the assistant message so page reloads see it.
              await supabaseService.from("chat_messages").insert({
                id: messageId,
                thread_id: threadId,
                user_id: user.id,
                role: "assistant",
                content: persistedContent,
                // Single persisted source of truth for media: the canonical
                // "## Visual Overview" block embedded in `content`. On reload the
                // client re-derives the gallery from it (FormattedResponse
                // content-parse path preserves pageUrl via the image title and the
                // [VIDEO:] marker). The live `media` SSE channel carried the
                // fast-phase gallery only — no second persisted copy in metadata.
                metadata: { trace_id: traceId },
              });
            } catch (e) { console.error("chat_messages insert error:", e); }

            try {
              // 2) Trace row.
              await supabaseService.from("agent_traces").insert({
                id: traceId,
                message_id: messageId,
                user_id: user.id, thread_id: threadId || null, category, sub_category: subCategory,
                competitor_name: competitor, system_prompt: systemPrompt, user_prompt: message,
                retrieved_documents: retrievedDocs, tool_calls: toolCallsLog,
                raw_llm_output: content, formatted_output: persistedContent,
                model_used: modelUsed,
                latency_ms: latencyMs, prompt_tokens: usage.prompt_tokens || null,
                completion_tokens: usage.completion_tokens || null, total_tokens: usage.total_tokens || null,
                status: "completed", trace_type: "conversation", agent_source: "comp_agent",
                metadata: {
                  slide_summary_status: "pending",
                  slide_summary_model: SLIDE_SUMMARY_MODEL,
                  contract_intent: contractResult.intent,
                  contract_violations: contractResult.violations,
                  contract_repairs: contractResult.repairs,
                  contract_repair_log: contractResult.repairLog,
                  contract_verdict: contractResult.verdict,
                  contract_repair_ms: contractResult.repairMs,
                  contract_judge_ms: contractResult.judgeMs,
                  judge_failure_reason: contractResult.judgeFailureReason,
                  live_crawl_triggered: liveCrawlMetadataOuter.length > 0,
                  live_crawl_reason: liveCrawlMetadataOuter.length > 0 ? "narrow_intent_gallery_miss" : null,
                  live_crawl_details: liveCrawlMetadataOuter,
                  gallery_filtered: (galleryResultsOuter || []).reduce((sum, g) => sum + (g.droppedOffTopic || 0), 0),
                  feed_news_count: feedEvidence.newsItems.length,
                  feed_community_count: feedEvidence.communityItems.length,
                  pipeline: {
                    requestId: crypto.randomUUID(),
                    checkpoint: "finalization_complete",
                    stages: stageDiagnostics,
                    finalize: finalizeDiag ?? null,
                    pipeline_version: "v2",
                    source_count: registry.list().length,
                  } as PipelineDiagnostics & Record<string, unknown>,
                },
              });
            } catch (traceInsertErr) { console.error("Trace insert error:", traceInsertErr); }

            // 3) Slide summary (still bounded by safeStage 120s).
            let slideSummary: SlideSummaryPayload | null = null;
            let slideSummaryError: string | null = null;
            if (LOVABLE_API_KEY) {
              const slideStage = await safeStage(
                "slide_summary",
                () => buildSlideSummaryPayload(
                  persistedContent,
                  `${category || ""} ${subCategory || ""} ${competitor || ""}`.trim(),
                  LOVABLE_API_KEY,
                ),
                null as SlideSummaryPayload | null,
                { timeoutMs: 120_000 },
              );
              slideSummary = slideStage.value;
              if (slideStage.degraded) slideSummaryError = slideStage.diagnostics.error ?? "stage_failed_soft";
            }

            // 3.5) Judge — off the critical path. Single source of truth for
            // eval-score persistence (replaces the deleted client-side write).
            let evalResult: Awaited<ReturnType<typeof judgeResponse>>["scores"] = null;
            let judgeFailureReason: string | null = null;
            let judgeMs = 0;
            try {
              // Judge the analytical body, not the gallery-prepended blob. The
              // "## Visual Overview" gallery is gathered + quality-gated by the
              // separate media pipeline; leaving it in the judged text makes the
              // LLM judge grade a wall of (often one-sided) screenshots instead of
              // the comparison prose, which structurally tanks the score. Strip the
              // leading Visual Overview block so the judge scores the actual answer.
              const contentForJudge = persistedContent
                .replace(/## Visual Overview\s*\n[\s\S]*?(?=\n## )/, "")
                .trim();
              const judged = await judgeResponse(contentForJudge, competitor || "", subCategory, contractResult.intent);
              evalResult = judged.scores;
              judgeFailureReason = judged.failureReason;
              judgeMs = judged.judgeMs;
            } catch (e) {
              judgeFailureReason = e instanceof Error ? e.message : String(e);
            }

            // 3.6) Persist evaluation_scores server-side (single source of truth).
            if (evalResult) {
              try {
                await supabaseService.from("evaluation_scores").insert({
                  user_id: user.id, category, sub_category: subCategory,
                  competitor_name: competitor, message_id: messageId,
                  factual_correctness: evalResult.factual_correctness?.score ?? null,
                  structural_clarity: evalResult.structural_clarity?.score ?? null,
                  depth_of_comparison: evalResult.depth_of_comparison?.score ?? null,
                  visual_evidence: evalResult.visual_evidence?.score ?? null,
                  citation_coverage: evalResult.citation_coverage?.score ?? null,
                  overall_score: evalResult.overall_score ?? null,
                });
              } catch (e) { console.error("evaluation_scores insert error:", e); }
            }

            // 4) Update trace with slide summary + judge scores.
            const judgeScores = evalResult ? {
              factual_correctness: evalResult.factual_correctness,
              structural_clarity: evalResult.structural_clarity,
              depth_of_comparison: evalResult.depth_of_comparison,
              visual_evidence: evalResult.visual_evidence,
              citation_coverage: evalResult.citation_coverage,
              actionability: evalResult.actionability,
              media_quality: evalResult.media_quality,
              overall_summary: evalResult.overall_summary,
              improvement_suggestions: evalResult.improvement_suggestions,
              weights_used: (evalResult as any).weights_used,
            } : {};
            const slideMetadata = slideSummary
              ? { slide_summary_status: "ready", slide_summary_model: slideSummary.model, slide_summary_version: slideSummary.version, slide_summary_generated_at: slideSummary.generated_at, slide_section_summaries: slideSummary.sections, slide_summary_lookup: slideSummary.lookup, slide_summary_diagnostics: slideSummary.diagnostics, slide_summary_error: null }
              : { slide_summary_status: "failed", slide_summary_model: SLIDE_SUMMARY_MODEL, slide_summary_error: slideSummaryError || "unknown" };
            try {
              await supabaseService.from("agent_traces").update({
                judge_scores: judgeScores,
                overall_score: evalResult?.overall_score ?? null,
                metadata: {
                  ...slideMetadata,
                  contract_intent: contractResult.intent,
                  contract_violations: contractResult.violations,
                  contract_repairs: contractResult.repairs,
                  contract_repair_log: contractResult.repairLog,
                  contract_verdict: contractResult.verdict,
                  contract_repair_ms: contractResult.repairMs,
                  contract_judge_ms: judgeMs,
                  judge_failure_reason: judgeFailureReason,
                  judge_weights_used: (evalResult as any)?.weights_used ?? null,
                  live_crawl_triggered: liveCrawlMetadataOuter.length > 0,
                  live_crawl_reason: liveCrawlMetadataOuter.length > 0 ? "narrow_intent_gallery_miss" : null,
                  live_crawl_details: liveCrawlMetadataOuter,
                  gallery_filtered: (galleryResultsOuter || []).reduce((sum, g) => sum + (g.droppedOffTopic || 0), 0),
                  pipeline: {
                    requestId: crypto.randomUUID(),
                    checkpoint: "persistence_complete",
                    stages: stageDiagnostics,
                    finalize: finalizeDiag ?? null,
                    pipeline_version: "v2",
                    source_count: registry.list().length,
                    degraded: stageDiagnostics.some((s) => s.status === "failed_soft"),
                  },
                },
              }).eq("id", traceId).eq("user_id", user.id);
            } catch (updateErr) { console.error("Trace update error:", updateErr); }
          })());
        } catch (innerErr) {
          const errStack = innerErr instanceof Error ? (innerErr.stack ?? "") : "";
          const errName = innerErr instanceof Error ? innerErr.name : "UnknownError";
          const errMsg = innerErr instanceof Error ? innerErr.message : String(innerErr);
          console.error("[chat-analysis:stream-error]", errName, errMsg, "\nSTACK:\n", errStack);
          try {
            const errEvent = `event: error\ndata: ${JSON.stringify({ content: "An error occurred processing your request." })}\n\n`;
            controller.enqueue(encoder.encode(errEvent));
          } catch {}

          try {
            supabaseService.from("agent_traces").insert({
              user_id: user.id, category: "unknown", sub_category: "unknown",
              status: "error", error_message: `${errName}: ${errMsg}`,
              latency_ms: Date.now() - traceStartTime,
              tool_calls: toolCallsLog, retrieved_documents: retrievedDocs,
              trace_type: 'conversation', agent_source: 'comp_agent',
              metadata: {
                error_name: errName,
                error_message: errMsg,
                error_stack: errStack.slice(0, 8000),
                stage_diagnostics: stageDiagnostics,
                last_completed_stage: stageDiagnostics.length > 0 ? stageDiagnostics[stageDiagnostics.length - 1].name : null,
                last_entered_stage: lastEnteredStage,
              },
            }).then(() => {}, () => {});
          } catch {}
        } finally {
          clearInterval(keepalive);
          try { controller.close(); } catch {}
        }
      },
    });

    return new Response(stream, { headers: sseHeaders });
  } catch (error) {
    console.error("Chat analysis error:", error);
    return new Response(JSON.stringify({ error: "An error occurred processing your request." }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
