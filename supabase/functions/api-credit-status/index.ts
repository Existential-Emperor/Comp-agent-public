import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const KEY_ENV_NAMES = [
  "FIRECRAWL_API_KEY_1",
  "FIRECRAWL_API_KEY_2",
  "FIRECRAWL_API_KEY_3",
  "FIRECRAWL_API_KEY_4",
];

const ANTHROPIC_KEY_NAMES = [
  "ANTHROPIC_API_KEY",
];

interface CreditInfo {
  totalCredits: number | null;
  usedCredits: number | null;
  remainingCredits: number | null;
  planName?: string | null;
  resetDate?: string | null;
  overageCredits?: number | null;
}

interface KeyLiveStatus {
  envName: string;
  service: string;
  configured: boolean;
  hint: string | null;
  liveStatus: "healthy" | "exhausted" | "error" | "unknown" | "unconfigured";
  liveMessage?: string;
  credits: CreditInfo;
}

async function getInitialCredits(supabase: any, keyName: string): Promise<number | null> {
  const { data } = await supabase
    .from("api_key_events")
    .select("metadata")
    .eq("service", "firecrawl")
    .eq("key_name", keyName)
    .eq("event_type", "initial_credits")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const meta = data?.metadata as Record<string, unknown> | null;
  return meta && typeof meta.initialCredits === "number" ? meta.initialCredits : null;
}

async function storeInitialCredits(supabase: any, keyName: string, initialCredits: number): Promise<void> {
  await supabase.from("api_key_events").insert({
    key_name: keyName,
    service: "firecrawl",
    event_type: "initial_credits",
    edge_function: "api-credit-status",
    notified: true,
    metadata: { initialCredits },
  });
}

async function checkFirecrawlKey(apiKey: string, keyName: string, supabase: any): Promise<{ status: string; message: string; credits: CreditInfo }> {
  const emptyCredits: CreditInfo = { totalCredits: null, usedCredits: null, remainingCredits: null };
  try {
    const res = await fetch("https://api.firecrawl.dev/v1/team/credit-usage", {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (res.status === 402) {
      await res.text();
      return { status: "exhausted", message: "Credits exhausted (402)", credits: { ...emptyCredits, remainingCredits: 0 } };
    }
    if (res.status === 401 || res.status === 403) {
      await res.text();
      return { status: "error", message: `Auth error (${res.status})`, credits: emptyCredits };
    }
    if (res.status === 429) {
      await res.text();
      return { status: "error", message: "Rate limited (429)", credits: emptyCredits };
    }

    if (res.status === 404) {
      await res.text();
      return { status: "healthy", message: "Key configured (balance endpoint unavailable)", credits: emptyCredits };
    }

    const data = await res.json();
    if (res.ok) {
      const d = data?.data || data;
      const remaining = d?.remaining_credits ?? d?.remainingCredits ?? null;
      const plan = d?.plan_credits ?? d?.planCredits ?? null;
      const overage = d?.overage_credits ?? d?.overageCredits ?? null;
      const totalUsed = d?.total_credits_used ?? d?.totalCreditsUsed ?? null;
      const resetDate = d?.coupon_credits_expiry ?? d?.subscription_current_period_end ?? null;

      let total: number | null = null;
      let used: number | null = null;

      if (plan != null && plan > 0) {
        total = plan + (overage || 0);
        used = (remaining != null) ? total - remaining : totalUsed;
      } else if (totalUsed != null && remaining != null) {
        total = totalUsed + remaining;
        used = totalUsed;
      } else if (remaining != null) {
        // Use stored initial credits as the total baseline
        let initialTotal = await getInitialCredits(supabase, keyName);
        if (initialTotal == null) {
          // First time seeing this key — store current remaining as the initial total
          initialTotal = remaining;
          await storeInitialCredits(supabase, keyName, remaining);
        }
        // If credits were topped up (remaining > initialTotal), update the baseline
        if (remaining > initialTotal) {
          initialTotal = remaining;
          await storeInitialCredits(supabase, keyName, remaining);
        }
        total = initialTotal;
        used = Math.max(0, initialTotal - remaining);
      }

      if (used != null && used < 0) used = 0;

      return {
        status: remaining === 0 ? "exhausted" : "healthy",
        message: remaining === 0 ? "No credits remaining" : "Key is active",
        credits: {
          totalCredits: total,
          usedCredits: used,
          remainingCredits: remaining,
          planName: d?.plan ?? null,
          resetDate,
          overageCredits: overage,
        },
      };
    }

    return { status: "unknown", message: `Unexpected status ${res.status}`, credits: emptyCredits };
  } catch (err) {
    return { status: "error", message: `Network error: ${err instanceof Error ? err.message : "unknown"}`, credits: emptyCredits };
  }
}

async function checkAnthropicKey(apiKey: string): Promise<{ status: string; message: string; credits: CreditInfo }> {
  const emptyCredits: CreditInfo = { totalCredits: null, usedCredits: null, remainingCredits: null };
  try {
    const res = await fetch("https://api.anthropic.com/v1/models", {
      method: "GET",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
    });

    if (res.status === 401 || res.status === 403) {
      await res.text();
      return { status: "error", message: `Auth error (${res.status})`, credits: emptyCredits };
    }
    if (res.status === 429) {
      await res.text();
      return { status: "error", message: "Rate limited (429)", credits: emptyCredits };
    }

    await res.text();
    if (res.ok || res.status === 200) {
      return { status: "healthy", message: "Key is active (credit balance not available via API)", credits: emptyCredits };
    }

    return { status: "unknown", message: `Status ${res.status}`, credits: emptyCredits };
  } catch (err) {
    return { status: "error", message: `Network error: ${err instanceof Error ? err.message : "unknown"}`, credits: emptyCredits };
  }
}


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const token = authHeader.replace("Bearer ", "");
  const anonClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "");
  const { data: { user }, error: authError } = await anonClient.auth.getUser(token);

  if (authError || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: isAdmin } = await supabase.rpc("has_role", {
    _user_id: user.id,
    _role: "admin",
  });

  if (!isAdmin) {
    return new Response(JSON.stringify({ error: "Admin access required" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // --- 1. Live key status checks ---
  const emptyCredits: CreditInfo = { totalCredits: null, usedCredits: null, remainingCredits: null };

  const firecrawlChecks = KEY_ENV_NAMES.map(async (envName) => {
    const val = Deno.env.get(envName);
    if (!val || !val.trim()) {
      return { envName, service: "firecrawl", configured: false, hint: null, liveStatus: "unconfigured" as const, credits: emptyCredits };
    }
    const result = await checkFirecrawlKey(val.trim(), envName, supabase);
    return {
      envName,
      service: "firecrawl",
      configured: true,
      hint: `...${val.trim().slice(-4)}`,
      liveStatus: result.status as KeyLiveStatus["liveStatus"],
      liveMessage: result.message,
      credits: result.credits,
    };
  });

  const anthropicCheck = (async () => {
    const val = Deno.env.get("ANTHROPIC_API_KEY");
    if (!val || !val.trim()) {
      return { envName: "ANTHROPIC_API_KEY", service: "anthropic", configured: false, hint: null, liveStatus: "unconfigured" as const, credits: emptyCredits };
    }
    const result = await checkAnthropicKey(val.trim());
    return {
      envName: "ANTHROPIC_API_KEY",
      service: "anthropic",
      configured: true,
      hint: `...${val.trim().slice(-4)}`,
      liveStatus: result.status as KeyLiveStatus["liveStatus"],
      liveMessage: result.message,
      credits: result.credits,
    };
  })();

  const allChecks = await Promise.all([...firecrawlChecks, anthropicCheck]);

  // --- 2. Event history ---
  const trackedEventTypes = ["credits_exhausted", "rate_limited", "auth_error", "unknown_error"];

  const { data: recentEvents } = await supabase
    .from("api_key_events")
    .select("*")
    .in("event_type", trackedEventTypes)
    .order("created_at", { ascending: false })
    .limit(100);

  // --- 3. Trend data (30 days) ---
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: trendEvents } = await supabase
    .from("api_key_events")
    .select("created_at, event_type, service, key_name")
    .in("event_type", trackedEventTypes)
    .gte("created_at", thirtyDaysAgo)
    .order("created_at", { ascending: true });

  return new Response(
    JSON.stringify({
      success: true,
      keyStatuses: allChecks,
      recentEvents: recentEvents || [],
      trendEvents: trendEvents || [],
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
