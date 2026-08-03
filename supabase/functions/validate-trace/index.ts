// validate-trace — admin endpoint to re-run the response contract on a stored
// trace and write fresh judge scores + violation metadata back to agent_traces.
//
// PRIVACY: Reads only fields stored in agent_traces. The contract itself only
// forwards (user_prompt, formatted_output) to the LLM gateway — no Adaptive
// Planning training-guide content leaves the system.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { runResponseContract } from "../_shared/response-contract.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: userErr } = await supabaseAuth.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Admin-only
    const { data: roleData } = await supabaseAdmin
      .from("user_roles").select("role")
      .eq("user_id", user.id).eq("role", "admin").maybeSingle();
    if (!roleData) {
      return new Response(JSON.stringify({ error: "Forbidden: admin role required" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const traceId = body?.trace_id || body?.traceId;
    if (!traceId || typeof traceId !== "string") {
      return new Response(JSON.stringify({ error: "trace_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: trace, error: traceErr } = await supabaseAdmin
      .from("agent_traces")
      .select("id, user_prompt, formatted_output, raw_llm_output, competitor_name, category, sub_category, metadata")
      .eq("id", traceId)
      .maybeSingle();

    if (traceErr || !trace) {
      return new Response(JSON.stringify({ error: "trace not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const content = trace.formatted_output || trace.raw_llm_output || "";
    if (!content.trim()) {
      return new Response(JSON.stringify({ error: "trace has no response content to validate" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await runResponseContract(
      content,
      trace.user_prompt || "",
      {
        competitor: trace.competitor_name || "",
        category: trace.category || "",
        subCategory: trace.sub_category || "",
      },
      { scoreOnly: true }, // do not mutate the stored response
    );

    const judgeScores = result.scores ? {
      factual_correctness: result.scores.factual_correctness,
      structural_clarity: result.scores.structural_clarity,
      depth_of_comparison: result.scores.depth_of_comparison,
      visual_evidence: result.scores.visual_evidence,
      citation_coverage: result.scores.citation_coverage,
      actionability: result.scores.actionability,
      media_quality: result.scores.media_quality,
      overall_summary: result.scores.overall_summary,
      improvement_suggestions: result.scores.improvement_suggestions,
    } : {};

    const mergedMeta = {
      ...(trace.metadata && typeof trace.metadata === "object" ? trace.metadata : {}),
      contract_violations: result.violations,
      contract_intent: result.intent,
      contract_revalidated_at: new Date().toISOString(),
      contract_revalidated_by: user.id,
      judge_failure_reason: result.judgeFailureReason,
    };

    const { error: updateErr } = await supabaseAdmin
      .from("agent_traces")
      .update({
        judge_scores: judgeScores,
        overall_score: result.scores?.overall_score ?? null,
        metadata: mergedMeta,
      })
      .eq("id", traceId);

    if (updateErr) {
      console.error("validate-trace update error:", updateErr);
      return new Response(JSON.stringify({ error: "failed to write scores" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      trace_id: traceId,
      verdict: result.verdict,
      violations: result.violations,
      intent: result.intent,
      overall_score: result.scores?.overall_score ?? null,
      judge_failure_reason: result.judgeFailureReason,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("validate-trace error:", e);
    return new Response(JSON.stringify({ error: "internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
