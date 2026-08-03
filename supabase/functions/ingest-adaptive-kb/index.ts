// Admin-only one-shot ingester for the Adaptive Planning knowledge base.
// Reads markdown corpus files bundled alongside this function, chunks them
// by heading, hashes each chunk, and upserts into public.adaptive_planning_kb.
// Idempotent — safe to re-run; existing chunks (matched by content_hash) are skipped.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { main_docs_parts } from "./corpus_main_docs.ts";
import { formulas_parts } from "./corpus_formulas.ts";
import { whats_new_parts } from "./corpus_whats_new.ts";
import { glossary_parts } from "./corpus_glossary.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SOURCES = [
  { name: "main-docs", parts: main_docs_parts, topics: ["overview", "modeling", "sheets", "reporting", "admin"] },
  { name: "formulas", parts: formulas_parts, topics: ["formulas", "modeling", "calculations"] },
  { name: "whats-new", parts: whats_new_parts, topics: ["release-notes", "roadmap", "ai", "features"] },
  { name: "glossary", parts: glossary_parts, topics: ["glossary", "terminology"] },
] as const;

const DOC_VERSION = "2026R1 (April 2026)";

function decodeParts(parts: string[]): string {
  // Each part is base64. Concat decoded bytes, then UTF-8 decode the whole thing
  // (splitting was done on byte boundaries which can cut multi-byte UTF-8 sequences).
  const chunks: Uint8Array[] = parts.map((p) => {
    const bin = atob(p);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return arr;
  });
  const total = chunks.reduce((a, c) => a + c.length, 0);
  const merged = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { merged.set(c, off); off += c.length; }
  return new TextDecoder("utf-8").decode(merged);
}

function clean(md: string): string {
  return md
    // strip Workday copyright lines
    .replace(/©\d{4}\s*Workday[^\n]*\n?/g, "")
    .replace(/Workday Proprietary and Confidential\n?/g, "")
    // strip "## Page N" markers
    .replace(/^##\s+Page\s+\d+\s*$/gm, "")
    // strip layout hints, image refs
    .replace(/<!--\s*layout:[^>]*-->/g, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    // strip TOC dot-leaders ("...........123")
    .replace(/\.{4,}\s*\d+\s*$/gm, "")
    // collapse runs of blank lines
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isTocLike(text: string): boolean {
  // A TOC chunk has lots of short lines that end in numbers with few prose words
  const lines = text.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length < 5) return false;
  const tocLines = lines.filter((l) => /\b\d{1,4}\s*$/.test(l) && l.length < 90).length;
  return tocLines / lines.length > 0.55;
}

interface Chunk {
  source_doc: string;
  doc_version: string;
  section_path: string;
  title: string;
  content: string;
  topics: string[];
  content_hash: string;
}

async function sha256(s: string): Promise<string> {
  const buf = new TextEncoder().encode(s);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}

async function chunkByHeading(
  md: string,
  source: typeof SOURCES[number],
  targetWords = 500,
  maxWords = 900
): Promise<Chunk[]> {
  const lines = md.split("\n");
  const sections: { path: string; title: string; content: string }[] = [];
  let h1 = "", h2 = "", h3 = "";
  let buf: string[] = [];
  const flush = () => {
    const text = buf.join("\n").trim();
    if (text.length > 80) {
      const path = [h1, h2, h3].filter(Boolean).join(" > ").replace(/\.{3,}.*$/g, "").trim();
      sections.push({
        path,
        title: (h3 || h2 || h1 || "Section").replace(/\.{3,}.*$/g, "").trim(),
        content: text,
      });
    }
    buf = [];
  };
  for (const line of lines) {
    const m1 = line.match(/^#\s+(.+)/);
    const m2 = line.match(/^##\s+(.+)/);
    const m3 = line.match(/^###\s+(.+)/);
    if (m1) { flush(); h1 = m1[1].trim(); h2 = ""; h3 = ""; continue; }
    if (m2) { flush(); h2 = m2[1].trim(); h3 = ""; continue; }
    if (m3) { flush(); h3 = m3[1].trim(); continue; }
    buf.push(line);
  }
  flush();

  const out: Chunk[] = [];
  for (const sec of sections) {
    if (isTocLike(sec.content)) continue;
    const words = sec.content.split(/\s+/);
    if (words.length < 25) continue;
    const pieces: string[] = [];
    if (words.length <= maxWords) {
      pieces.push(sec.content);
    } else {
      const paragraphs = sec.content.split(/\n\n+/);
      let cur: string[] = [], curW = 0;
      for (const p of paragraphs) {
        const pw = p.split(/\s+/).length;
        if (curW + pw > targetWords && cur.length) {
          pieces.push(cur.join("\n\n"));
          cur = [p]; curW = pw;
        } else {
          cur.push(p); curW += pw;
        }
      }
      if (cur.length) pieces.push(cur.join("\n\n"));
    }
    for (const piece of pieces) {
      const trimmed = piece.trim();
      if (trimmed.split(/\s+/).length < 25) continue;
      out.push({
        source_doc: source.name,
        doc_version: DOC_VERSION,
        section_path: sec.path,
        title: sec.title.slice(0, 240),
        content: trimmed,
        topics: source.topics as unknown as string[],
        content_hash: await sha256(`${source.name}|${sec.path}|${trimmed}`),
      });
    }
  }
  return out;
}

// (loadCorpus removed — corpus is now inlined as base64 TS modules)

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Auth: accept either an admin user JWT or the service-role key (for one-shot ops)
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    let authorized = false;

    if (token && token === serviceKey) {
      authorized = true;
    } else if (token) {
      const { data: userData, error: userErr } = await supabase.auth.getUser(token);
      if (!userErr && userData.user) {
        const { data: roleRow } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", userData.user.id)
          .eq("role", "admin")
          .maybeSingle();
        if (roleRow) authorized = true;
      }
    }

    if (!authorized) {
      return new Response(JSON.stringify({ error: "Admin role or service key required" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = new URL(req.url);
    const dryRun = url.searchParams.get("dry_run") === "true";
    const onlyDoc = url.searchParams.get("only");

    const report: Record<string, { chunks: number; inserted: number; skipped: number }> = {};
    let allChunks: Chunk[] = [];

    for (const src of SOURCES) {
      if (onlyDoc && onlyDoc !== src.name) continue;
      const raw = decodeParts(src.parts as unknown as string[]);
      const chunks = await chunkByHeading(clean(raw), src);
      report[src.name] = { chunks: chunks.length, inserted: 0, skipped: 0 };
      allChunks = allChunks.concat(chunks);
    }

    if (dryRun) {
      return new Response(
        JSON.stringify({ dry_run: true, report, total_chunks: allChunks.length }, null, 2),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Upsert in batches of 50, ON CONFLICT(source_doc, content_hash) DO NOTHING
    const BATCH = 50;
    for (let i = 0; i < allChunks.length; i += BATCH) {
      const batch = allChunks.slice(i, i + BATCH);
      const { error, count } = await supabase
        .from("adaptive_planning_kb")
        .upsert(batch, { onConflict: "source_doc,content_hash", ignoreDuplicates: true, count: "exact" });
      if (error) {
        console.error("upsert batch failed", i, error);
        return new Response(JSON.stringify({ error: error.message, batch_index: i }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const inserted = count ?? 0;
      // Distribute inserted count across docs in the batch (best-effort)
      for (const c of batch) {
        report[c.source_doc].inserted += inserted > 0 ? 1 : 0;
      }
    }

    // Authoritative counts via DB
    const counts: Record<string, number> = {};
    for (const src of SOURCES) {
      const { count } = await supabase
        .from("adaptive_planning_kb")
        .select("id", { count: "exact", head: true })
        .eq("source_doc", src.name);
      counts[src.name] = count ?? 0;
    }

    return new Response(
      JSON.stringify({
        ok: true,
        report,
        total_chunks_built: allChunks.length,
        db_counts: counts,
      }, null, 2),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("ingest-adaptive-kb error", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
