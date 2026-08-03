// Shared accessor for the XLSX-ingested competitor knowledge base.
// Used by chat-analysis (system prompt facts + priority Firecrawl seed) and
// news-queue (union competitor coverage list).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export type CompetitorProfile = {
  id: string;
  name: string;
  website: string | null;
  links: Array<{ url: string; type?: string; label?: string }>;
  segments: string[];
  market_focus: string | null;
  founder: string | null;
  funding: string | null;
  product_focus: string | null;
  category: string | null;
  momentum: string | null;
  market_size: string | null;
};

let _cache: { rows: CompetitorProfile[]; at: number } | null = null;
const TTL_MS = 5 * 60 * 1000;

function client() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function getAllProfiles(): Promise<CompetitorProfile[]> {
  if (_cache && Date.now() - _cache.at < TTL_MS) return _cache.rows;
  const sb = client();
  if (!sb) return [];
  const { data, error } = await sb
    .from("competitor_profiles")
    .select("id,name,website,links,segments,market_focus,founder,funding,product_focus,category,momentum,market_size");
  if (error || !data) {
    console.error("getAllProfiles error:", error);
    return [];
  }
  const rows = (data as any[]).map((r) => ({
    ...r,
    links: Array.isArray(r.links) ? r.links : [],
    segments: Array.isArray(r.segments) ? r.segments : [],
  })) as CompetitorProfile[];
  _cache = { rows, at: Date.now() };
  return rows;
}

export async function getProfilesByNames(names: string[]): Promise<CompetitorProfile[]> {
  if (!names || names.length === 0) return [];
  const all = await getAllProfiles();
  const want = new Set(names.map((n) => n.toLowerCase().trim()));
  return all.filter((p) => want.has(p.name.toLowerCase().trim()));
}

/** Format profiles as a "SHEET-PROVIDED FACTS" prompt block. */
export function formatProfilesForPrompt(profiles: CompetitorProfile[]): string {
  if (!profiles || profiles.length === 0) return "";
  // Token guard: full facts if ≤3 competitors, condensed otherwise.
  const condensed = profiles.length > 3;
  const lines: string[] = ["--- SHEET-PROVIDED FACTS (authoritative — do NOT re-research these fields) ---"];
  for (const p of profiles) {
    const fields: string[] = [];
    if (p.market_focus) fields.push(`Market: ${p.market_focus}`);
    if (!condensed && p.founder) fields.push(`Founder: ${p.founder}`);
    if (!condensed && p.funding) fields.push(`Funding: ${p.funding}`);
    if (!condensed && p.product_focus) fields.push(`Product: ${p.product_focus}`);
    if (p.category) fields.push(`Category: ${p.category}`);
    if (p.momentum) fields.push(`Momentum: ${p.momentum}`);
    if (!condensed && p.market_size) fields.push(`Market Size: ${p.market_size}`);
    const url = p.website || (p.links[0]?.url ?? "");
    const head = fields.length ? `${p.name} — ${fields.join("; ")}` : p.name;
    lines.push(url ? `${head}\n  Preferred URL: ${url}` : head);
  }
  lines.push("--- END FACTS ---");
  lines.push(
    "Treat the above as ground truth for company background (founder, funding, market focus, momentum, category, market size). Do NOT contradict or re-derive them. Continue to crawl/search for product capability detail, news, and comparisons.",
  );
  return lines.join("\n");
}

/**
 * Find competitor profiles whose name (or alias) appears in the given text.
 * Whole-word, case-insensitive, longest-name-first to avoid sub-string collisions
 * (e.g. "Board" inside "Board International"). Returns matches in order of length.
 */
export async function findProfilesInText(text: string): Promise<CompetitorProfile[]> {
  if (!text || !text.trim()) return [];
  const all = await getAllProfiles();
  if (all.length === 0) return [];
  const lower = text.toLowerCase();
  const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  // Build {name, alias[]} candidates, sorted longest-first.
  const candidates = all.map((p) => {
    const aliases = new Set<string>([p.name]);
    const company = (p as any)?.extra?.Company;
    if (typeof company === "string" && company.trim()) aliases.add(company.trim());
    return { profile: p, aliases: Array.from(aliases) };
  });
  candidates.sort((a, b) => Math.max(...b.aliases.map((s) => s.length)) - Math.max(...a.aliases.map((s) => s.length)));

  const matched = new Map<string, CompetitorProfile>();
  const consumedRanges: Array<[number, number]> = [];
  const overlaps = (start: number, end: number) =>
    consumedRanges.some(([s, e]) => start < e && end > s);

  for (const { profile, aliases } of candidates) {
    for (const alias of aliases) {
      if (!alias || alias.length < 2) continue;
      const re = new RegExp(`\\b${escapeRe(alias.toLowerCase())}\\b`, "g");
      let m: RegExpExecArray | null;
      while ((m = re.exec(lower))) {
        const start = m.index;
        const end = start + alias.length;
        if (overlaps(start, end)) continue;
        consumedRanges.push([start, end]);
        if (!matched.has(profile.id)) matched.set(profile.id, profile);
        break;
      }
      if (matched.has(profile.id)) break;
    }
  }
  return Array.from(matched.values());
}

/** Return preferred crawl seed URLs (website + typed links) for a competitor. */
export function getPriorityUrls(profile: CompetitorProfile | undefined | null): string[] {
  if (!profile) return [];
  const out: string[] = [];
  if (profile.website) out.push(profile.website);
  for (const l of profile.links || []) {
    if (l && typeof l.url === "string" && l.url.startsWith("http") && !out.includes(l.url)) {
      out.push(l.url);
    }
  }
  return out.slice(0, 5);
}
