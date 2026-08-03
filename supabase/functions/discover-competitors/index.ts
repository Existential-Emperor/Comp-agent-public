import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getProductAreaDescription } from "../_shared/product-areas.ts";
import { firecrawlFetch, hasFirecrawlKey } from "../_shared/firecrawl-keys.ts";
import { monitoredFetch } from "../_shared/monitored-fetch.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

let claudeRateLimited = false;

function deduplicateCompetitors(comps: { name: string; website: string; description: string }[]) {
  // Canonical brand tokens — maps variations to a single canonical name
  const BRAND_ALIASES: Record<string, string[]> = {
    "oracle epm cloud": ["oracle fusion epm cloud", "oracle fusion cloud epm", "oracle hyperion planning", "oracle essbase", "oracle epm", "oracle pbcs", "oracle epbcs"],
    "sap analytics cloud": ["sap bpc", "sap group reporting", "sap sac", "sap analytics"],
    "ibm planning analytics": ["ibm cognos tm1", "ibm tm1"],
    "onestream": ["onestream xf", "onestream software"],
    "anaplan": [],
    "pigment": [],
    "planful": [],
    "vena": ["vena solutions", "vena complete planning"],
    "board": ["board international"],
    "prophix": [],
    "jedox": [],
    "workiva": [],
    "datarails": [],
  };

  // Build reverse lookup: lowered alias → canonical name
  const aliasToCanonical = new Map<string, string>();
  for (const [canonical, aliases] of Object.entries(BRAND_ALIASES)) {
    aliasToCanonical.set(canonical, canonical);
    for (const alias of aliases) {
      aliasToCanonical.set(alias, canonical);
    }
  }

  function getCanonicalKey(name: string): string {
    const lower = name.toLowerCase().trim();
    // Direct alias match
    if (aliasToCanonical.has(lower)) return aliasToCanonical.get(lower)!;
    // Substring match: "SAP Analytics Cloud Platform" → "sap analytics cloud"
    for (const [alias, canonical] of aliasToCanonical) {
      if (lower.includes(alias) || alias.includes(lower)) return canonical;
    }
    // Extract brand token: strip common suffixes
    const stripped = lower
      .replace(/\s+(ai|cloud|platform|analytics|planning|solutions|software|suite|copilot|agent|assistant|xf|international)\s*/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
    return stripped;
  }

  // Prefer the competitor name that best matches a known canonical form, or the shortest
  const PREFERRED_NAMES: Record<string, string> = {
    "oracle epm cloud": "Oracle EPM Cloud",
    "sap analytics cloud": "SAP Analytics Cloud",
    "ibm planning analytics": "IBM Planning Analytics",
    "onestream": "OneStream",
    "vena": "Vena",
    "board": "Board",
  };

  const seen = new Map<string, { name: string; website: string; description: string }>();
  for (const c of comps) {
    const key = getCanonicalKey(c.name);
    if (seen.has(key)) {
      // Keep the preferred name or the shorter one
      const existing = seen.get(key)!;
      const preferredName = PREFERRED_NAMES[key];
      if (preferredName && c.name === preferredName) {
        seen.set(key, { ...c, description: c.description || existing.description, website: c.website || existing.website });
      }
      // Otherwise keep existing (first seen wins, unless current is preferred)
    } else {
      // Use preferred name if available
      const preferredName = PREFERRED_NAMES[key];
      if (preferredName) {
        seen.set(key, { ...c, name: preferredName });
      } else {
        seen.set(key, c);
      }
    }
  }
  return [...seen.values()];
}

const KNOWN_PLATFORMS = [
  "Anaplan", "Oracle EPM Cloud", "SAP Analytics Cloud", "OneStream", "Planful",
  "Vena", "Datarails", "Pigment", "Jedox", "Board", "Prophix", "Tagetik",
  "IBM Planning Analytics", "Cube Software", "Kepion", "Longview", "Workiva",
  "Centage", "Solver", "Jirav", "Mosaic", "Abacum", "Drivetrain", "Causal", "TeamOhana"
];

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

async function claudeWebSearch(query: string, maxUses = 3): Promise<string[]> {
  if (claudeRateLimited) return [];
  const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
  if (!ANTHROPIC_API_KEY) return [];

  try {
    console.log("Claude web search:", query.slice(0, 120));
    const res = await monitoredFetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 3000,
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: maxUses }],
        messages: [{ role: "user", content: query }],
      }),
    }, { keyName: "ANTHROPIC_API_KEY", service: "anthropic", edgeFunction: "discover-competitors" });

    if (res.status === 429) {
      console.error("Claude rate limited");
      claudeRateLimited = true;
      await res.text();
      return [];
    }

    if (!res.ok) {
      console.error("Claude error:", res.status);
      await res.text();
      return [];
    }

    const data = await res.json();
    const results: string[] = [];
    for (const block of data.content || []) {
      if (block.type === "text") {
        results.push(block.text);
      } else if (block.type === "web_search_tool_result") {
        for (const sr of block.content || []) {
          if (sr.type === "web_search_result") {
            results.push(`[Source: ${sr.url}] ${sr.title}: ${(sr.page_content || sr.encrypted_content || "").slice(0, 300)}`);
          }
        }
      }
    }
    return results;
  } catch (err) {
    console.error("Claude web search error:", err);
    return [];
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

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
    const token = authHeader.replace('Bearer ', '');
    const { data: userData, error: userError } = await supabaseAuth.auth.getUser(token);
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { category, subCategory } = await req.json();
    if (
      typeof category !== "string" || typeof subCategory !== "string" ||
      category.length < 1 || category.length > 200 ||
      subCategory.length < 1 || subCategory.length > 200
    ) {
      return new Response(JSON.stringify({ error: "Invalid input" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const searchStartTime = Date.now();

    // ===== OPTIMIZATION A: Check cache first =====
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: cachedCompetitors } = await supabase
      .from("competitors")
      .select("name, website, description, updated_at")
      .eq("category", category)
      .eq("sub_category", subCategory);

    if (cachedCompetitors && cachedCompetitors.length >= 5) {
      // Check freshness — if most recent entry is < 24h old, serve from cache
      const newest = cachedCompetitors.reduce((a, b) =>
        new Date(a.updated_at) > new Date(b.updated_at) ? a : b
      );
      const age = Date.now() - new Date(newest.updated_at).getTime();

      if (age < CACHE_TTL_MS) {
        const competitors = cachedCompetitors.map(c => ({
          name: c.name, website: c.website || "", description: c.description || ""
        }));
        console.log(`Cache hit: ${competitors.length} competitors for ${subCategory} (age: ${Math.round(age / 60000)}m)`);
        return new Response(JSON.stringify({ competitors, cached: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // ===== Cache miss — do live discovery =====
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const isFullProduct = category === "Full Product" && subCategory === "Full Product";

    let competitors: { name: string; website: string; description: string }[] = [];

    const productAreaDesc = getProductAreaDescription(category, subCategory);
    const shortDesc = productAreaDesc ? productAreaDesc.split(".").slice(0, 2).join(".") + "." : "";
    const searchSubject = isFullProduct ? "Workday Adaptive Planning as a full EPM/FP&A platform" : `${subCategory} (${category})`;

    if (ANTHROPIC_API_KEY) {
      console.log("Searching competitors for:", searchSubject);
      claudeRateLimited = false;

      const allResults: string[] = [];

      // Reduced max_uses from 4 to 2 for faster searches
      // IMPORTANT: Prompts explicitly instruct Claude to NOT return duplicates or brand variations
      const dedupeInstruction = `CRITICAL: Do NOT list multiple variations of the same company/product. For example, "Oracle EPM Cloud", "Oracle Hyperion", "Oracle PBCS" are all the SAME competitor — list it ONCE as "Oracle EPM Cloud". Similarly "SAP BPC" and "SAP Analytics Cloud" should be listed once as "SAP Analytics Cloud". "OneStream XF" = "OneStream". Use canonical product names only. Never repeat a vendor under different product names.`;

      const searchResults = await Promise.all([
        claudeWebSearch(
          isFullProduct
            ? `List major enterprise EPM/CPM/FP&A platforms competing with Workday Adaptive Planning in 2025. Include: ${KNOWN_PLATFORMS.join(", ")}. For each: name, website, one sentence on capabilities. ${dedupeInstruction}`
            : `List FP&A/planning software competing with Workday Adaptive Planning in "${subCategory}" (${category}). ${shortDesc} For each: name, website, how they offer ${subCategory}. ${dedupeInstruction}`,
          2
        ),
        claudeWebSearch(
          isFullProduct
            ? `Find newer/niche enterprise financial planning platforms competing with Workday Adaptive Planning 2025. Include Mosaic, Abacum, Drivetrain, Causal, Jirav. For each: name, website, capabilities. ${dedupeInstruction}`
            : `Find ANY software (BI, data, spreadsheet add-ons) offering: ${shortDesc || subCategory}. Include niche players. For each: name, website, how they compete. ${dedupeInstruction}`,
          2
        ),
      ]);

      for (const results of searchResults) allResults.push(...results);

      if (LOVABLE_API_KEY && allResults.length > 0) {
        const extractPrompt = `Extract competitors for Workday Adaptive Planning's "${subCategory}" (${category}).
${shortDesc ? `PRODUCT AREA: "${shortDesc}"` : ""}

IMPORTANT: Include ALL of these if they offer ${subCategory} capabilities: ${KNOWN_PLATFORMS.join(", ")}.
Also include any other relevant competitors from the search results.

DEDUPLICATION RULE: Each company must appear ONLY ONCE. Use canonical names:
- "Oracle EPM Cloud" (not "Oracle Hyperion", "Oracle PBCS", "Oracle Essbase", "Oracle Fusion EPM")
- "SAP Analytics Cloud" (not "SAP BPC", "SAP Group Reporting", "SAP SAC")  
- "IBM Planning Analytics" (not "IBM Cognos TM1", "IBM TM1")
- "OneStream" (not "OneStream XF", "OneStream Software")
- "Vena" (not "Vena Solutions")
- "Board" (not "Board International")
If you see multiple product lines from the same vendor, merge them into ONE entry.

Search results:
${allResults.join("\n\n").slice(0, 12000)}

Return JSON array: [{name, website, description}]. Max 20. Exclude Workday. ONLY the JSON array.`;

        const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${LOVABLE_API_KEY}` },
          body: JSON.stringify({ model: "openai/gpt-5.5", messages: [{ role: "user", content: extractPrompt }] }),
        });

        const aiData = await aiRes.json();
       // @ts-ignore - hoisted var used later in trace insert
       var discoverUsage: any = aiData.usage || {};
       // @ts-ignore
       var discoverSystemPrompt: any = extractPrompt;
        const content = aiData.choices?.[0]?.message?.content || "[]";
        try {
          const jsonMatch = content.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            competitors = JSON.parse(jsonMatch[0]).map((c: any) => ({
              name: c.name, website: c.website, description: c.description,
            }));
            console.log(`Extracted ${competitors.length} competitors`);
          }
        } catch {
          console.error("Failed to parse AI competitor extraction");
        }

        competitors = deduplicateCompetitors(competitors);
      }
    }

    // Fallback 1: Firecrawl
    if (competitors.length === 0) {
      if (hasFirecrawlKey() && LOVABLE_API_KEY) {
        console.log("Falling back to Firecrawl");
        const fcResults = await Promise.all([
          `FP&A software ${subCategory} competitors Workday Adaptive Planning 2025`,
          `${subCategory} software tools budgeting forecasting enterprise`,
        ].map(async (query) => {
          try {
            const r = await firecrawlFetch("https://api.firecrawl.dev/v1/search", {
              method: "POST",
              body: JSON.stringify({ query, limit: 5 }),
            });
            if (!r.ok) return [];
            const d = await r.json();
            return (d.data || []).map((r: any) => `[${r.url}] ${r.title || ""}: ${(r.description || "").slice(0, 300)}`);
          } catch { return []; }
        }));

        const firecrawlResults = fcResults.flat();
        if (firecrawlResults.length > 0) {
          const extractPrompt = `Extract competitors for Workday Adaptive Planning's "${subCategory}" (${category}).
Include these if relevant: ${KNOWN_PLATFORMS.join(", ")}.
Search results:
${firecrawlResults.join("\n\n")}
Return JSON array: [{name, website, description}]. Max 20. Exclude Workday. ONLY JSON.`;

          const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${LOVABLE_API_KEY}` },
            body: JSON.stringify({ model: "openai/gpt-5.5", messages: [{ role: "user", content: extractPrompt }] }),
          });

          const aiData = await aiRes.json();
          const content2 = aiData.choices?.[0]?.message?.content || "[]";
          try {
            const jsonMatch = content2.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
              competitors = JSON.parse(jsonMatch[0]).map((c: any) => ({
                name: c.name, website: c.website, description: c.description,
              }));
            }
          } catch { console.error("Failed to parse Firecrawl extraction"); }
        }
      }
    }

    // Fallback 2: Direct AI
    if (competitors.length === 0 && LOVABLE_API_KEY) {
      console.log("Falling back to direct AI");
      const prompt = `List software competing with Workday Adaptive Planning in "${subCategory}" (${category}).
Include: ${KNOWN_PLATFORMS.join(", ")} and any specialized tools.
Return JSON array: [{name, website, description}]. Max 20. ONLY JSON.`;

      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${LOVABLE_API_KEY}` },
        body: JSON.stringify({ model: "openai/gpt-5.5", messages: [{ role: "user", content: prompt }] }),
      });

      const data = await response.json();
      const content3 = data.choices?.[0]?.message?.content || "[]";
      try {
        const jsonMatch = content3.match(/\[[\s\S]*\]/);
        if (jsonMatch) competitors = JSON.parse(jsonMatch[0]);
      } catch { competitors = []; }
    }

    // Store in database (fire-and-forget)
    const userId = userData.user.id as string;
    const searchLatencyMs = Date.now() - searchStartTime;

    (async () => {
      try {
        await supabase.from("agent_traces").insert({
          user_id: userId, category, sub_category: subCategory,
          trace_type: 'search', status: competitors.length > 0 ? 'completed' : 'error',
          error_message: competitors.length === 0 ? 'No competitors found' : null,
          latency_ms: searchLatencyMs,
          formatted_output: JSON.stringify(competitors.map(c => c.name)),
          raw_llm_output: JSON.stringify(competitors),
          user_prompt: `Discover competitors for ${subCategory} (${category})`,
          system_prompt: typeof discoverSystemPrompt === 'string' ? discoverSystemPrompt : null,
          model_used: "openai/gpt-5.5",
          agent_source: "comp_agent",
          prompt_tokens: typeof discoverUsage !== 'undefined' ? (discoverUsage.prompt_tokens || null) : null,
          completion_tokens: typeof discoverUsage !== 'undefined' ? (discoverUsage.completion_tokens || null) : null,
          total_tokens: typeof discoverUsage !== 'undefined' ? (discoverUsage.total_tokens || null) : null,
          retrieved_documents: [],
          tool_calls: [],
          metadata: { competitor_count: competitors.length, source: claudeRateLimited ? 'fallback' : 'claude_web_search' },
        });

        const { data: existingComps } = await supabase
          .from("competitors").select("name")
          .eq("sub_category", subCategory)
          .in("name", competitors.map(c => c.name));

        const existingNames = new Set((existingComps || []).map((c: any) => c.name));
        const newComps = competitors.filter(c => !existingNames.has(c.name));
        if (newComps.length > 0) {
          await supabase.from("competitors").insert(
            newComps.map(comp => ({
              name: comp.name, website: comp.website, description: comp.description,
              category, sub_category: subCategory, is_seed: false,
              discovered_by: "claude-web-search+ai",
            }))
          );
        }
      } catch (e) { console.error("DB write error:", e); }
    })();

    console.log(`Discovery completed in ${searchLatencyMs}ms, ${competitors.length} competitors`);

    return new Response(JSON.stringify({ competitors }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Discover competitors error:", error);
    return new Response(JSON.stringify({ error: "An error occurred processing your request." }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
