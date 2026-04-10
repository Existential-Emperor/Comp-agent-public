import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  try {
    const { bullets, context } = await req.json();

    if (!Array.isArray(bullets) || bullets.length === 0) {
      return new Response(
        JSON.stringify({ summaries: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    // Build numbered list for the AI to summarize
    const numberedBullets = bullets
      .map((b: string, i: number) => `[${i + 1}] ${b}`)
      .join("\n");

    const systemPrompt = `You are a presentation content editor. Your job is to transform verbose analysis bullets into concise, slide-ready summaries.

Rules:
- Each summary must capture the FULL meaning of the original bullet — not just the first sentence
- Distill the key insight, finding, or recommendation into 2-3 clear sentences
- Maximum 500 characters per summary
- Remove all markdown formatting, links, and citations
- Use active voice and strong verbs
- Do NOT add new information — only summarize what's given
- Do NOT truncate or cut off mid-sentence — every summary must end with a complete thought
- Maintain the same numbered order as input
- Return ONLY a JSON array of strings, one per input bullet
- The array must have exactly ${bullets.length} items`;

    const userPrompt = `${context ? `Context: ${context}\n\n` : ""}Summarize each bullet for a presentation slide:\n\n${numberedBullets}`;

    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "openai/gpt-5-nano",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          max_completion_tokens: 4096,
        }),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      // Fallback: return original bullets trimmed
      return new Response(
        JSON.stringify({
          summaries: bullets.map((b: string) => {
          const clean = b.replace(/\*\*/g, "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").trim();
            return clean;
          }),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const rawContent = data.choices?.[0]?.message?.content || "[]";

    // Extract JSON array from response (handle markdown code fences)
    const jsonMatch = rawContent.match(/\[[\s\S]*\]/);
    let summaries: string[];
    try {
      summaries = JSON.parse(jsonMatch?.[0] || "[]");
    } catch {
      // Fallback parse: split by newlines
      summaries = rawContent
        .split("\n")
        .map((l: string) => l.replace(/^\d+[\.\)]\s*/, "").replace(/^["']|["']$/g, "").trim())
        .filter((l: string) => l.length > 5);
    }

    // Ensure we have the right count, pad/trim as needed
    while (summaries.length < bullets.length) {
      const idx = summaries.length;
      const fallback = bullets[idx].replace(/\*\*/g, "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").trim();
      summaries.push(fallback);
    }
    summaries = summaries.slice(0, bullets.length);

    return new Response(
      JSON.stringify({ summaries }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("summarize-for-slides error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
