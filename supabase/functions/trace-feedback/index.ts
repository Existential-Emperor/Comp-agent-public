
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

    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.45.0");
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { trace_id, feedback_vote, feedback_comment } = body;

    if (!trace_id) {
      return new Response(JSON.stringify({ error: "trace_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build update payload — only include fields that are explicitly provided
    const updatePayload: Record<string, unknown> = {};

    if (feedback_vote !== undefined) {
      if (feedback_vote !== null && feedback_vote !== "like" && feedback_vote !== "dislike") {
        return new Response(JSON.stringify({ error: "feedback_vote must be 'like', 'dislike', or null" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      updatePayload.feedback_vote = feedback_vote;
    }

    if (feedback_comment !== undefined) {
      updatePayload.feedback_comment = feedback_comment || null;
    }

    if (Object.keys(updatePayload).length === 0) {
      return new Response(JSON.stringify({ error: "No fields to update" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data, error } = await supabase
      .from("agent_traces")
      .update(updatePayload)
      .eq("id", trace_id)
      .eq("user_id", user.id)
      .select("id, feedback_vote, feedback_comment")
      .single();

    if (error) throw error;

    return new Response(JSON.stringify({ success: true, trace: data }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Trace feedback error:", error);
    return new Response(JSON.stringify({ error: "An error occurred." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
