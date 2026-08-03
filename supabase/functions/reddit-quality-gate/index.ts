import { requireAuth } from "../_shared/auth.ts";
import { gateRedditItems, type RedditItem } from "../_shared/reddit-quality-scorer.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") || "";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // --- Auth guard (shared): valid user JWT or service-role key required ---
  const authError = await requireAuth(req, corsHeaders);
  if (authError) return authError;

  if (!LOVABLE_API_KEY) {
    return new Response(
      JSON.stringify({ success: false, error: "LOVABLE_API_KEY not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  let items: RedditItem[] = [];
  let count = 100;
  let threshold = 24;
  try {
    const body = await req.json();
    items = body?.items || [];
    if (typeof body?.count === "number") count = body.count;
    if (typeof body?.threshold === "number") threshold = body.threshold;
  } catch {}

  if (!items.length) {
    return new Response(
      JSON.stringify({ success: false, error: "No items provided" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  console.log(`reddit-quality-gate: Scoring ${items.length} items, threshold=${threshold}, count=${count}`);

  const { scored, passing } = await gateRedditItems(items, { threshold, count });
  const rejected = scored.length - passing.length;

  console.log(`Quality gate: ${passing.length} passed (${rejected} rejected) out of ${scored.length} scored`);

  return new Response(JSON.stringify({
    success: true,
    totalScored: scored.length,
    passing: passing.length,
    rejected,
    threshold,
    items: passing,
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
