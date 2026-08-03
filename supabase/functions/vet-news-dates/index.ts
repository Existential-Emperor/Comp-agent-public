import { requireAuth } from "../_shared/auth.ts";
// One-shot admin tool: re-vets published_at on existing news_items rows
// using the same 2-tier resolver as news-hydrate (Tier A scrape -> Tier B vision).
// Usage: POST { mode?: "all" | "recent" | "review_only", limit?: number, dry_run?: boolean }
//   - mode "all": every row with a source_url
//   - mode "recent": last `limit` rows (default 200, ordered by created_at desc)
//   - mode "review_only": rows where needs_date_review=true OR date_source IS NULL
//   - dry_run: returns proposed changes without writing
//
// Privacy: only the public source_url and its own screenshot leave the system.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { firecrawlFetch, hasFirecrawlKey } from "../_shared/firecrawl-keys.ts";
import { parseDateLoose, clampDate, extractDateFromHtml } from "../_shared/news-queue.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PER_SCRAPE_TIMEOUT_MS = 30000;
const VISION_TIMEOUT_MS = 25000;
const CONCURRENCY = 4;

async function visionExtractDate(screenshotUrl: string): Promise<string | null> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) return null;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), VISION_TIMEOUT_MS);
  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: "openai/gpt-5.5",
        messages: [{
          role: "user",
          content: [
            { type: "text", text: "Look at this screenshot of a news article. Find the publication date displayed on the page (often near the title, byline, or footer). Respond with ONLY a JSON object: {\"date\": \"YYYY-MM-DD\"} or {\"date\": null} if no date is visible. Do not include any other text." },
            { type: "image_url", image_url: { url: screenshotUrl } },
          ],
        }],
      }),
    });
    clearTimeout(t);
    if (!res.ok) return null;
    const data = await res.json();
    const content: string = data?.choices?.[0]?.message?.content || "";
    const m = content.match(/\{[\s\S]*?\}/);
    if (!m) return null;
    const parsed = JSON.parse(m[0]);
    if (!parsed?.date || typeof parsed.date !== "string") return null;
    return clampDate(parseDateLoose(parsed.date));
  } catch {
    clearTimeout(t);
    return null;
  }
}

async function resolveDate(sourceUrl: string): Promise<{ date: string | null; source: string | null; error?: string }> {
  // ---- Tier A ----
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), PER_SCRAPE_TIMEOUT_MS);
  try {
    const res = await firecrawlFetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      body: JSON.stringify({ url: sourceUrl, formats: ["markdown", "html"], onlyMainContent: false, waitFor: 2000 }),
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (res.ok) {
      const data = await res.json();
      const page = data?.data || data || {};
      const meta = page.metadata || {};
      const html: string = typeof page.html === "string" ? page.html : (typeof page.rawHtml === "string" ? page.rawHtml : "");
      const md: string = typeof page.markdown === "string" ? page.markdown : "";

      const metaCandidates = [
        meta.publishedTime, meta.published_time, meta["article:published_time"],
        meta["og:article:published_time"], meta.datePublished, meta.date,
        meta.publishDate, meta["dc.date.issued"],
      ];
      for (const c of metaCandidates) {
        if (typeof c !== "string") continue;
        const parsed = clampDate(parseDateLoose(c));
        if (parsed) return { date: parsed, source: "firecrawl_meta" };
      }
      if (html) {
        const fromHtml = extractDateFromHtml(html);
        if (fromHtml.date) return { date: fromHtml.date, source: fromHtml.source };
      }
      if (md) {
        const head = md.slice(0, 2000);
        const parsed = clampDate(parseDateLoose(head));
        if (parsed) return { date: parsed, source: "firecrawl_body" };
      }
    }
  } catch (e) {
    clearTimeout(t);
    // fall through to Tier B
  }

  // ---- Tier B ----
  try {
    const sc = new AbortController();
    const st = setTimeout(() => sc.abort(), PER_SCRAPE_TIMEOUT_MS);
    const shotRes = await firecrawlFetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      body: JSON.stringify({
        url: sourceUrl,
        formats: ["screenshot"],
        onlyMainContent: false,
        waitFor: 2000,
        screenshot: { fullPage: true },
      }),
      signal: sc.signal,
    });
    clearTimeout(st);
    if (shotRes.ok) {
      const shotData = await shotRes.json();
      const shotPage = shotData?.data || shotData || {};
      const shotUrl: string | undefined =
        shotPage.screenshot || shotPage.screenshotUrl || shotPage.metadata?.screenshot;
      if (shotUrl) {
        const visionDate = await visionExtractDate(shotUrl);
        if (visionDate) return { date: visionDate, source: "vision_screenshot" };
      }
    }
  } catch {}

  return { date: null, source: null, error: "tier-A and tier-B both missed" };
}

async function processInBatches<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    const slice = items.slice(i, i + size);
    const results = await Promise.all(slice.map(fn));
    out.push(...results);
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // --- Auth guard (shared): valid user JWT or service-role key required ---
  const authError = await requireAuth(req, corsHeaders);
  if (authError) return authError;

  if (!hasFirecrawlKey()) {
    return new Response(JSON.stringify({ success: false, error: "Firecrawl not configured" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const body = await req.json().catch(() => ({}));
  const mode: "all" | "recent" | "review_only" = body?.mode ?? "all";
  const limit: number = Math.min(Math.max(Number(body?.limit) || 500, 1), 2000);
  const dryRun: boolean = body?.dry_run === true;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let q = supabase
    .from("news_items")
    .select("id, source_url, title, published_at, date_source, needs_date_review")
    .eq("item_type", "news") // Community items are exempt from date vetting
    .not("source_url", "is", null);

  if (mode === "recent") {
    q = q.order("created_at", { ascending: false }).limit(limit);
  } else if (mode === "review_only") {
    q = q.or("needs_date_review.eq.true,date_source.is.null").limit(limit);
  } else {
    q = q.order("created_at", { ascending: false }).limit(limit);
  }

  const { data: items, error } = await q;
  if (error) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!items || items.length === 0) {
    return new Response(JSON.stringify({ success: true, vetted: 0, message: "no rows matched" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const stats = { total: items.length, updated: 0, unchanged: 0, unresolved: 0, errors: 0, vision_used: 0 };

  // Kick off the long-running vet in the background (EdgeRuntime.waitUntil)
  // so the HTTP response returns immediately. Caller can poll DB for progress.
  const work = (async () => {
    await processInBatches(items as any[], CONCURRENCY, async (item) => {
      try {
        const { date, source } = await resolveDate(item.source_url);

        if (!date) {
          stats.unresolved++;
          if (!dryRun) {
            await supabase.from("news_items").update({
              needs_date_review: true,
            }).eq("id", item.id);
          }
          return;
        }

        // `date` may be a full ISO ("2025-04-14T00:00:00.000Z") or "YYYY-MM-DD".
        // Normalize to a valid Date in both cases.
        const parsed = new Date(date.length === 10 ? `${date}T12:00:00Z` : date);
        if (isNaN(parsed.getTime())) {
          stats.errors++;
          console.warn(`[vet-news-dates] unparseable resolved date "${date}" for ${item.id}`);
          return;
        }
        const newIsoDay = parsed.toISOString().slice(0, 10);
        const oldIsoDay = item.published_at
          ? new Date(item.published_at).toISOString().slice(0, 10)
          : null;

        if (source === "vision_screenshot") stats.vision_used++;

        if (oldIsoDay === newIsoDay && item.date_source === source) {
          stats.unchanged++;
          return;
        }

        stats.updated++;
        if (!dryRun) {
          await supabase.from("news_items").update({
            published_at: parsed.toISOString(),
            date_source: source,
            needs_date_review: false,
          }).eq("id", item.id);
        }
      } catch (e) {
        stats.errors++;
        console.warn(`[vet-news-dates] error on ${item.id}: ${(e as Error).message}`);
      }
    });
    console.log(`[vet-news-dates] DONE ${JSON.stringify(stats)} dryRun=${dryRun}`);
  })();

  // @ts-ignore - EdgeRuntime is provided by Supabase Deno runtime
  if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) {
    // @ts-ignore
    EdgeRuntime.waitUntil(work);
  } else {
    work.catch((e) => console.error("[vet-news-dates] background error:", e));
  }

  return new Response(JSON.stringify({
    success: true,
    mode,
    dry_run: dryRun,
    queued: items.length,
    message: "Vetting started in background. Poll news_items to see updates.",
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
