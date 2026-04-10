import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { createClient } = await import("jsr:@supabase/supabase-js@2");

    // Auth client to verify user
    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: userErr } = await supabaseAuth.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Service role client to check admin & query traces
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Check admin role
    const { data: roleData } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Forbidden: admin role required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "list";

    if (action === "list") {
      // Query traces with filters
      const category = url.searchParams.get("category");
      const subCategory = url.searchParams.get("sub_category");
      const competitor = url.searchParams.get("competitor_name");
      const status = url.searchParams.get("status");
      const feedbackVote = url.searchParams.get("feedback_vote");
      const minScore = url.searchParams.get("min_score");
      const startDate = url.searchParams.get("start_date");
      const endDate = url.searchParams.get("end_date");
      const limit = parseInt(url.searchParams.get("limit") || "50");
      const offset = parseInt(url.searchParams.get("offset") || "0");

      let query = supabaseAdmin
        .from("agent_traces")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (category) query = query.eq("category", category);
      if (subCategory) query = query.eq("sub_category", subCategory);
      if (competitor) query = query.ilike("competitor_name", `%${competitor}%`);
      if (status) query = query.eq("status", status);
      if (feedbackVote) query = query.eq("feedback_vote", feedbackVote);
      if (minScore) query = query.gte("overall_score", parseFloat(minScore));
      if (startDate) query = query.gte("created_at", startDate);
      if (endDate) query = query.lte("created_at", endDate);
      const traceType = url.searchParams.get("traceType");
      if (traceType) query = query.eq("trace_type", traceType);

      const { data, error, count } = await query;
      if (error) throw error;

      return new Response(JSON.stringify({ traces: data, total: count }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "analytics") {
      // Aggregate analytics
      const days = parseInt(url.searchParams.get("days") || "30");
      const since = new Date(Date.now() - days * 86400000).toISOString();

      const { data: traces, error } = await supabaseAdmin
        .from("agent_traces")
        .select("category, sub_category, competitor_name, overall_score, latency_ms, total_tokens, status, feedback_vote, created_at, trace_type")
        .gte("created_at", since)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const total = traces?.length || 0;
      const completed = traces?.filter((t: any) => t.status === "completed").length || 0;
      const failed = traces?.filter((t: any) => t.status === "error").length || 0;
      const avgScore = total > 0
        ? traces!.reduce((s: number, t: any) => s + (t.overall_score || 0), 0) / total
        : 0;
      const avgLatency = total > 0
        ? traces!.reduce((s: number, t: any) => s + (t.latency_ms || 0), 0) / total
        : 0;
      const totalTokens = traces?.reduce((s: number, t: any) => s + (t.total_tokens || 0), 0) || 0;
      const likes = traces?.filter((t: any) => t.feedback_vote === "like").length || 0;
      const dislikes = traces?.filter((t: any) => t.feedback_vote === "dislike").length || 0;

      // Category breakdown
      const byCategory: Record<string, number> = {};
      for (const t of traces || []) {
        byCategory[t.category] = (byCategory[t.category] || 0) + 1;
      }

      return new Response(JSON.stringify({
        period_days: days,
        total_runs: total,
        completed,
        failed,
        avg_score: Math.round(avgScore * 100) / 100,
        avg_latency_ms: Math.round(avgLatency),
        total_tokens: totalTokens,
        feedback: { likes, dislikes },
        by_category: byCategory,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "detail") {
      const traceId = url.searchParams.get("id");
      if (!traceId) {
        return new Response(JSON.stringify({ error: "id parameter required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data, error } = await supabaseAdmin
        .from("agent_traces")
        .select("*")
        .eq("id", traceId)
        .single();

      if (error) throw error;

      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action. Use: list, analytics, detail" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Admin traces error:", error);
    return new Response(JSON.stringify({ error: "An error occurred." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
