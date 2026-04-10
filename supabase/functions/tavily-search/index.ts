import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { monitoredFetch } from "../_shared/monitored-fetch.ts";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query, maxResults, includeDomains } = await req.json();

    if (!query) {
      return new Response(
        JSON.stringify({ success: false, error: "Query is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ success: false, error: "Anthropic API key not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Claude web search:", query);

    // Build the search prompt with domain constraints if specified
    let searchPrompt = query;
    if (includeDomains && includeDomains.length > 0) {
      searchPrompt = `Search specifically on ${includeDomains.join(" and ")} for: ${query}`;
    }

    const response = await monitoredFetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: maxResults || 5 }],
        messages: [{ role: "user", content: searchPrompt }],
      }),
    }, { keyName: "ANTHROPIC_API_KEY", service: "anthropic", edgeFunction: "tavily-search" });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Claude API error:", errText);
      return new Response(
        JSON.stringify({ success: false, error: `Claude API error: ${response.status}` }),
        { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();

    // Extract text answer and search results
    let answer = "";
    const results: { title: string; url: string; content: string }[] = [];

    for (const block of data.content || []) {
      if (block.type === "text") {
        answer += block.text;
      } else if (block.type === "web_search_tool_result") {
        for (const sr of block.content || []) {
          if (sr.type === "web_search_result") {
            results.push({
              title: sr.title || "",
              url: sr.url || "",
              content: sr.page_content || sr.encrypted_content || "",
            });
          }
        }
      }
    }

    return new Response(JSON.stringify({ success: true, answer, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Claude web search error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Failed to search" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
