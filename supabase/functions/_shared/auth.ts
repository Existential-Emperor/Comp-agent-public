import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Shared authentication guard for edge functions.
 *
 * Authorization model: a caller is accepted if EITHER
 *   1. it presents a valid end-user JWT (frontend invocations), OR
 *   2. it presents the project SERVICE_ROLE key (server-to-server / cron calls).
 *
 * Anonymous callers (no token, or an arbitrary/garbage token) are rejected.
 * This blocks credit-draining / SSRF / data-mutation abuse without breaking
 * internal fan-out calls, which pass `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`.
 */

export function isServiceRole(req: Request): boolean {
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!serviceKey) return false;
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  const apikey = (req.headers.get("apikey") ?? "").trim();
  return token === serviceKey || apikey === serviceKey;
}

/**
 * Validates a pg_cron caller. Scheduled jobs cannot present a user JWT or the
 * service-role key (the key value is not reachable from Postgres on Lovable
 * Cloud), so they send a dedicated shared secret via the `x-cron-secret` header.
 * The expected value lives encrypted in Vault and is checked through the
 * service-role-only `verify_cron_secret` RPC. The header is never sent by the
 * frontend, so normal user traffic never incurs this DB round-trip.
 */
export async function isValidCronCaller(req: Request): Promise<boolean> {
  const secret = req.headers.get("x-cron-secret");
  if (!secret) return false;
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data, error } = await supabase.rpc("verify_cron_secret", { _s: secret });
    return !error && data === true;
  } catch {
    return false;
  }
}

export async function getAuthedUser(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return null;
    return user;
  } catch {
    return null;
  }
}

/**
 * Returns `null` when the request is authorized, or a 401 `Response` when not.
 *
 * Usage (immediately after the OPTIONS preflight handler):
 *   const authError = await requireAuth(req, corsHeaders);
 *   if (authError) return authError;
 */
export async function requireAuth(
  req: Request,
  corsHeaders: Record<string, string>,
): Promise<Response | null> {
  if (isServiceRole(req)) return null;
  if (await isValidCronCaller(req)) return null;
  const user = await getAuthedUser(req);
  if (user) return null;
  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
