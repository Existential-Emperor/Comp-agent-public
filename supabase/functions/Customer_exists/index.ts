// Customer_exists — vet customers against the 6 enumerable competitors' URL
// patterns using a certificate-transparency (crt.sh) tenant index, matched
// locally. Only the 6 public competitor root domains are sent externally;
// customer names/URLs never leave the system.
//
// Architecture: this is a *bounded, stateless worker*, not a self-chaining
// loop. Each invocation does at most one unit of work — refresh one stale
// index root, or match one chunk of pending customers — then returns. An
// external pg_cron tick (every minute) is the durable queue driver: if a tick
// is CPU-killed mid-chunk, the rows it already wrote leave the pending pool and
// the next tick picks up the remainder. No self-invocation, no continuation
// that depends on a clean return.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { requireAuth } from "../_shared/auth.ts";
import {
  COMPETITOR_PATTERNS,
  deriveCandidateSlugs,
  isReservedSlug,
} from "../_shared/competitor-tenant-patterns.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version, x-cron-secret",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Bounded per-invocation work. Sized so one chunk (load index + match + a
// single set-based write) completes well inside the CPU budget.
const CHUNK_SIZE = 2000;
// Lease window: if a worker is CPU-killed without releasing the lease, the next
// tick reclaims it after this long.
const LEASE_MINUTES = 3;

const admin = () => createClient(SUPABASE_URL, SERVICE_KEY);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---- CT index refresh ------------------------------------------------------

async function fetchCrtHostnames(root: string): Promise<string[]> {
  // crt.sh is flaky and rate-limits / 502s under load. Each invocation makes a
  // couple of fast attempts; the cron cadence provides the longer retry rhythm.
  const url = `https://crt.sh/?q=${encodeURIComponent("%." + root)}&output=json`;
  const MAX_ATTEMPTS = 2;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "sentinel-tenant-radar", "Accept": "application/json" },
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (res.status === 503 || res.status === 502 || res.status === 429) {
        console.warn(`crt.sh ${root} -> HTTP ${res.status} (attempt ${attempt}/${MAX_ATTEMPTS})`);
        if (attempt < MAX_ATTEMPTS) { await sleep(attempt * 3000 + Math.random() * 2000); continue; }
        return [];
      }
      if (!res.ok) {
        console.warn(`crt.sh ${root} -> HTTP ${res.status}`);
        return [];
      }
      const json = await res.json();
      const hosts = new Set<string>();
      for (const row of Array.isArray(json) ? json : []) {
        const nameValue: string = row?.name_value ?? "";
        const common: string = row?.common_name ?? "";
        for (const h of (nameValue + "\n" + common).split(/\s+/)) {
          const t = h.trim().toLowerCase();
          if (t) hosts.add(t);
        }
      }
      return [...hosts];
    } catch (e) {
      clearTimeout(timer);
      console.error(`crt.sh fetch failed for ${root} (attempt ${attempt}/${MAX_ATTEMPTS}):`, String((e as Error)?.message ?? e));
      if (attempt < MAX_ATTEMPTS) { await sleep(attempt * 3000 + Math.random() * 2000); continue; }
      return [];
    }
  }
  return [];
}

/** Fetch + upsert the CT tenant index for a single competitor root. */
async function refreshOneRoot(pattern: typeof COMPETITOR_PATTERNS[number]): Promise<number> {
  const sb = admin();
  const hosts = await fetchCrtHostnames(pattern.root);
  if (hosts.length === 0) {
    console.warn(`refreshOneRoot ${pattern.name}: 0 hostnames (crt.sh unavailable)`);
    return 0;
  }
  const rows: { competitor: string; tenant_slug: string; observed_hostname: string }[] = [];
  const seen = new Set<string>();
  for (const host of hosts) {
    const slug = pattern.extractSlug(host);
    if (!slug || isReservedSlug(slug)) continue;
    const key = pattern.name + "|" + host;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ competitor: pattern.name, tenant_slug: slug, observed_hostname: host.replace(/^\*\./, "") });
  }
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const { error } = await sb
      .from("competitor_tenant_index")
      .upsert(chunk, { onConflict: "competitor,observed_hostname", ignoreDuplicates: true });
    if (error) console.error(`index upsert error (${pattern.name}):`, error.message);
  }
  console.log(`indexed ${pattern.name}: ${rows.length} tenant hostnames`);
  return rows.length;
}

/**
 * Competitor patterns whose tenant index has not been bootstrapped yet (zero
 * rows). Presence — not age — is the freshness signal: the index upserts with
 * `ignoreDuplicates`, so existing rows never get a refreshed timestamp, which
 * would make an age-based check treat an already-complete root as permanently
 * stale. A populated root is considered ready; a forced re-index is an explicit,
 * separate operation (clear + run).
 */
async function staleRoots(): Promise<typeof COMPETITOR_PATTERNS> {
  const sb = admin();
  const ready = new Set<string>();
  for (const p of COMPETITOR_PATTERNS) {
    const { count } = await sb
      .from("competitor_tenant_index")
      .select("id", { count: "exact", head: true })
      .eq("competitor", p.name);
    if ((count ?? 0) > 0) ready.add(p.name);
  }
  return COMPETITOR_PATTERNS.filter((p) => !ready.has(p.name));
}

// ---- Matching --------------------------------------------------------------

/** Load the full index into Map<competitor, Map<slug, hostname>>. */
async function loadIndex(): Promise<Map<string, Map<string, string>>> {
  const sb = admin();
  const map = new Map<string, Map<string, string>>();
  for (const p of COMPETITOR_PATTERNS) map.set(p.name, new Map());

  const PAGE = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await sb
      .from("competitor_tenant_index")
      .select("competitor, tenant_slug, observed_hostname")
      .range(from, from + PAGE - 1);
    if (error) { console.error("loadIndex error:", error.message); break; }
    if (!data || data.length === 0) break;
    for (const r of data) {
      const m = map.get(r.competitor);
      if (m && !m.has(r.tenant_slug)) m.set(r.tenant_slug, r.observed_hostname);
    }
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return map;
}

async function pendingCount(): Promise<number> {
  const sb = admin();
  const { count } = await sb
    .from("customers")
    .select("id", { count: "exact", head: true })
    .eq("match_status", "pending");
  return count ?? 0;
}

// ---- Liveness probe (DNS-over-HTTPS) ---------------------------------------
//
// A slug present in a competitor's CT-log index proves a cert was *issued* for
// that tenant hostname at some point — not that the tenant is live today. We
// resolve each matched hostname over public DNS to classify it:
//   - "dead"    : NXDOMAIN / no A record  -> decommissioned, drop the match.
//   - "private" : resolves only to RFC1918 addresses -> provisioned internal
//                 tenant, keep matched but flag "Hosted Privately".
//   - "live"    : resolves to a public address -> reachable tenant.
//   - "unknown" : resolver error/timeout -> keep matched (don't demote on a
//                 transient failure); a later re-run re-probes it.
//
// Only the competitor hostname (already public, derived from CT logs) is sent
// to the resolver. No customer name/ID/URL ever leaves the system.
type Liveness = "live" | "private" | "dead" | "unknown";

function isPrivateIp(ip: string): boolean {
  const m = ip.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return false;
  const a = Number(m[1]), b = Number(m[2]);
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 127) return true;            // loopback
  if (a === 169 && b === 254) return true; // link-local
  return false;
}

async function probeLiveness(hostname: string): Promise<Liveness> {
  const host = hostname.replace(/^\*\./, "").replace(/\.$/, "");
  const url = `https://dns.google/resolve?name=${encodeURIComponent(host)}&type=A`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, { headers: { accept: "application/dns-json" }, signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return "unknown";
    const json = await res.json();
    if (json?.Status === 3) return "dead"; // NXDOMAIN: name does not exist
    const ips = (Array.isArray(json?.Answer) ? json.Answer : [])
      .filter((a: { type?: number }) => a?.type === 1)
      .map((a: { data?: string }) => a?.data)
      .filter((d: unknown): d is string => typeof d === "string");
    if (ips.length === 0) return "dead"; // NOERROR but no routable A record
    return ips.every(isPrivateIp) ? "private" : "live";
  } catch {
    clearTimeout(timer);
    return "unknown";
  }
}

/** Probe distinct hostnames with bounded concurrency; deduped by caller. */
async function probeHosts(hosts: string[]): Promise<Map<string, Liveness>> {
  const out = new Map<string, Liveness>();
  const CONCURRENCY = 12;
  let i = 0;
  const worker = async () => {
    while (i < hosts.length) {
      const idx = i++;
      out.set(hosts[idx], await probeLiveness(hosts[idx]));
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, hosts.length) }, worker));
  return out;
}



/**
 * Match a single bounded chunk of pending customers and write the results with
 * ONE set-based update (apply_customer_matches), not per-row round-trips.
 * Returns the number of customers processed (0 when the pending pool is empty).
 *
 * Read-only on the pending pool until the write: rows stay `pending` until the
 * bulk write flips them. So a CPU-kill before the write simply leaves them for
 * the next tick — no orphaned intermediate state to reclaim.
 */
async function matchChunk(): Promise<number> {
  const sb = admin();
  const index = await loadIndex();

  // PostgREST caps a single response at db-max-rows (1000 on this project), so
  // .limit(CHUNK_SIZE) is silently clamped. Page with a stable id order to
  // actually claim up to CHUNK_SIZE rows — keeps the knob meaningful and the
  // tick read consistent (the worker holds the lease, so the pending set is
  // not mutated underneath this read).
  const PAGE = 1000;
  const batch: Array<{ id: string; customer_name: string | null; customer_url: string | null; valid_domains: unknown }> = [];
  while (batch.length < CHUNK_SIZE) {
    const want = Math.min(PAGE, CHUNK_SIZE - batch.length);
    const { data, error } = await sb
      .from("customers")
      .select("id, customer_name, customer_url, valid_domains")
      .eq("match_status", "pending")
      .order("id")
      .range(batch.length, batch.length + want - 1);
    if (error) { console.error("fetch batch error:", error.message); break; }
    if (!data || data.length === 0) break;
    batch.push(...data);
    if (data.length < want) break;
  }
  if (batch.length === 0) return 0;

  // Phase 1 — local slug match: find each customer's candidate competitor
  // hostnames from the CT index (no network).
  type Cand = { competitor: string; slug: string; hostname: string };
  const perCustomer = batch.map((c) => {
    const candidates = deriveCandidateSlugs(c.customer_name, c.customer_url, c.valid_domains);
    const found: Cand[] = [];
    for (const p of COMPETITOR_PATTERNS) {
      const slugMap = index.get(p.name)!;
      for (const cand of candidates) {
        const hostname = slugMap.get(cand);
        if (hostname) { found.push({ competitor: p.name, slug: cand, hostname }); break; }
      }
    }
    return { id: c.id, found };
  });

  // Phase 2 — liveness: resolve each distinct matched hostname once. A CT-log
  // hit only proves a cert was issued; DNS resolution proves the tenant is real
  // today. Dead (NXDOMAIN) hostnames are demoted to unmatched; private ones are
  // kept and tagged.
  const distinctHosts = [...new Set(perCustomer.flatMap((x) => x.found.map((f) => f.hostname)))];
  const verdicts = await probeHosts(distinctHosts);

  // Phase 3 — assemble writes: drop dead matches, carry liveness into details.
  const rows = perCustomer.map(({ id, found }) => {
    const surviving = found.filter((f) => verdicts.get(f.hostname) !== "dead");
    const matched = surviving.map((f) => f.competitor);
    const details: Record<string, { slug: string; hostname: string; liveness: Liveness }> = {};
    for (const f of surviving) {
      details[f.competitor] = { slug: f.slug, hostname: f.hostname, liveness: verdicts.get(f.hostname) ?? "unknown" };
    }
    return {
      id,
      match_status: matched.length ? "matched" : "unmatched",
      matched_competitors: matched,
      match_details: matched.length ? details : null,
    };
  });


  const { error: applyErr } = await sb.rpc("apply_customer_matches", { _rows: rows });
  if (applyErr) {
    console.error("apply_customer_matches error:", applyErr.message);
    return 0;
  }
  return batch.length;
}

// ---- Lease (single-statement, pooler-safe mutex) ---------------------------

/**
 * Acquire the singleton matcher lease via a SECURITY DEFINER RPC. The UPDATE
 * inside the function is a single atomic statement — concurrent ticks serialize
 * on row id=1 and only one wins. A lease older than LEASE_MINUTES is reclaimable
 * (covers a worker that was CPU-killed before releasing). Using an RPC (rather
 * than REST table access) keeps this independent of the PostgREST column cache.
 */
async function acquireLease(): Promise<boolean> {
  const { data, error } = await admin().rpc("acquire_match_lease", { _lease_minutes: LEASE_MINUTES });
  if (error) { console.error("acquireLease error:", error.message); return false; }
  return data === true;
}

async function releaseLease(): Promise<void> {
  const { error } = await admin().rpc("release_match_lease");
  if (error) console.error("releaseLease error:", error.message);
}

// ---- Handler ---------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authError = await requireAuth(req, corsHeaders);
  if (authError) return authError;

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    let action = "run";
    let reset = false;
    try {
      const body = await req.json();
      if (body?.action) action = String(body.action);
      reset = body?.reset === true;
    } catch { /* no body -> defaults */ }

    // Reset is an explicit re-match: flip everything back to pending and let the
    // cron drain it. Runs independently of the worker lease.
    if (reset) {
      await admin().from("customers").update({
        match_status: "pending",
        matched_competitors: [],
        match_details: null,
        last_checked_at: null,
      }).neq("match_status", "pending");
    }

    // Single-worker guard: if another tick holds the lease, no-op immediately.
    const got = await acquireLease();
    if (!got) {
      return json({ ok: true, action, phase: "skipped", reason: "another worker active" });
    }

    try {
      // --- Index bootstrap phase: advance at most one stale root per tick. ---
      if (action === "run" || action === "refresh_index") {
        const stale = await staleRoots();
        if (stale.length > 0) {
          const target = stale[0];
          const indexed = await refreshOneRoot(target);
          return json({
            ok: true,
            action,
            phase: "refresh",
            indexed_root: target.name,
            indexed,
            stale_roots: stale.map((s) => s.name),
          });
        }
        if (action === "refresh_index") {
          return json({ ok: true, action, phase: "refresh_complete" });
        }
      }

      // --- Match phase: one bounded chunk. ---
      const processed = await matchChunk();
      const remaining = await pendingCount();
      return json({ ok: true, action, phase: "match", processed, remaining });
    } finally {
      await releaseLease();
    }
  } catch (e) {
    console.error("Customer_exists error:", e);
    return json({ ok: false, error: String((e as Error)?.message ?? e) }, 500);
  }
});
