import { requireAuth } from "../_shared/auth.ts";
// Stage 3 of the news pipeline.
// Atomically claims queue rows in status='hydrated' by flipping them to
// 'finalizing' (scoped to this invocation via a claim_id), then inserts
// them into news_items and marks them 'inserted'. The claim step prevents
// two concurrent invocations from inserting the same row twice.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { gateNewsItems, type ScoredNewsItem } from "../_shared/news-quality-scorer.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BATCH_SIZE = 100;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // --- Auth guard (shared): valid user JWT or service-role key required ---
  const authError = await requireAuth(req, corsHeaders);
  if (authError) return authError;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Step 1: peek at hydrated row IDs (FIFO).
  const { data: candidates, error: peekErr } = await supabase
    .from("news_ingestion_queue")
    .select("id")
    .eq("status", "hydrated")
    .order("created_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (peekErr) {
    return new Response(JSON.stringify({ success: false, error: peekErr.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!candidates || candidates.length === 0) {
    return new Response(JSON.stringify({ success: true, inserted: 0, claimed: 0 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Step 2: atomically claim by flipping hydrated -> finalizing with a unique claim_id.
  // Only rows still in 'hydrated' will flip; concurrent claimers get a disjoint set.
  const claimId = crypto.randomUUID();
  const candidateIds = candidates.map((r: any) => r.id);

  const { data: claimed, error: claimErr } = await supabase
    .from("news_ingestion_queue")
    .update({
      status: "finalizing",
      metadata: { claim_id: claimId, claimed_at: new Date().toISOString() },
    })
    .in("id", candidateIds)
    .eq("status", "hydrated") // race guard
    .select("id, competitor_name, source_url, title, summary, image_url, source_name, published_at, date_source, needs_date_review");

  if (claimErr) {
    return new Response(JSON.stringify({ success: false, error: claimErr.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const rows = claimed || [];
  if (rows.length === 0) {
    return new Response(JSON.stringify({ success: true, inserted: 0, claimed: 0 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const stats = {
    claimed: rows.length,
    inserted: 0,
    skipped_duplicate: 0,
    errors: 0,
    skipped_out_of_range: 0,
    skipped_quality_gate: 0,
    llm_unavailable: false,
  };
  const insertedIds: string[] = [];
  const oneYearAgo = Date.now() - 365 * 86400000;
  const tomorrow = Date.now() + 86400000;

  // Step 2.5: LLM quality gate over the claimed batch. The deterministic
  // filters in news-queue.ts already rejected the easy noise; this catches
  // residual cases (nav-menu mentions, earnings scheduling, listing pages).
  const gateCandidates = rows.map((r: any) => ({
    url: r.source_url,
    title: r.title || "",
    content: r.summary || "",
    detectedCompetitor: r.competitor_name || r.source_name || "",
  }));
  const gateResult = await gateNewsItems(gateCandidates);
  stats.llm_unavailable = gateResult.llmUnavailable;
  const scoresByUrl = new Map<string, ScoredNewsItem["scores"]>();
  for (const s of gateResult.scored) scoresByUrl.set(s.url, s.scores);
  // When the LLM is unavailable, fall back to passing everything (deterministic verdict wins).
  const passingUrls = new Set(
    gateResult.llmUnavailable
      ? gateCandidates.map((c) => c.url)
      : gateResult.passing.map((p) => p.url)
  );

  for (const row of rows as any[]) {
    // Reject items dated outside the rolling window (but allow null dates)
    if (row.published_at) {
      const t = new Date(row.published_at).getTime();
      if (!isNaN(t) && (t < oneYearAgo || t > tomorrow)) {
        await supabase.from("news_ingestion_queue").update({
          status: "skipped",
          last_error: `out of range: ${row.published_at}`,
        }).eq("id", row.id);
        stats.skipped_out_of_range++;
        continue;
      }
    }

    // Quality gate
    if (!passingUrls.has(row.source_url)) {
      const s = scoresByUrl.get(row.source_url);
      await supabase.from("news_ingestion_queue").update({
        status: "skipped",
        last_error: s
          ? `quality gate: total=${s.total} subj=${s.subjecthood} genre=${s.genre_fit} subst=${s.substance} indep=${s.independence}`
          : "quality gate: rejected",
      }).eq("id", row.id);
      stats.skipped_quality_gate++;
      continue;
    }

    const qs = scoresByUrl.get(row.source_url);

    const { error: insErr } = await supabase.from("news_items").insert({
      title: row.title || "Untitled",
      summary: row.summary || null,
      source_url: row.source_url,
      source_name: row.competitor_name || row.source_name || null,
      image_url: row.image_url || null,
      item_type: "news",
      published_at: row.published_at || null,
      date_source: row.date_source || null,
      needs_date_review: row.needs_date_review === true,
      fetched_at: new Date().toISOString(),
      quality_subjecthood: qs?.subjecthood ?? null,
      quality_genre_fit: qs?.genre_fit ?? null,
      quality_substance: qs?.substance ?? null,
      quality_independence: qs?.independence ?? null,
      quality_total: qs?.total ?? null,
    });

    if (insErr) {
      if (insErr.message?.toLowerCase().includes("duplicate") || (insErr as any).code === "23505") {
        stats.skipped_duplicate++;
        insertedIds.push(row.id); // still mark inserted — row already exists
      } else {
        stats.errors++;
        await supabase.from("news_ingestion_queue").update({
          status: "failed",
          last_error: `insert: ${insErr.message}`.slice(0, 500),
        }).eq("id", row.id);
      }
      continue;
    }

    stats.inserted++;
    insertedIds.push(row.id);
  }

  // Step 3: mark successfully-inserted rows as 'inserted'. Scoped to our claim_id
  // so a stuck/retried invocation can't flip rows it doesn't own.
  if (insertedIds.length > 0) {
    await supabase
      .from("news_ingestion_queue")
      .update({ status: "inserted" })
      .in("id", insertedIds)
      .eq("status", "finalizing");
  }

  console.log(`[news-finalize] claim=${claimId} ${JSON.stringify(stats)}`);

  return new Response(JSON.stringify({ success: true, claim_id: claimId, ...stats }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
