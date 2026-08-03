// parse-roadmap-document — single-responsibility parser for the roadmap KB.
//
// Reads an uploaded file from the private `roadmap-uploads` bucket (service role)
// and returns parsed text as MARKDOWN. Text-native formats are parsed entirely
// in-isolate. Scanned/image-only PDFs (no extractable text layer) are OCR'd by
// rasterizing each page (mupdf-wasm) and reading it with a vision model over the
// Lovable AI Gateway — the SAME trusted internal AI path the agent already uses
// to process Adaptive Planning KB content. No third-party OCR provider (Google
// Document AI, AWS Textract, etc.) is ever called, so roadmap content never
// crosses a trust boundary beyond the gateway the app already relies on.
//
// Gated to admins (same allow-list as /admin/api-credits = user_roles 'admin').

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import JSZip from "https://esm.sh/jszip@3.10.1";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";
import { extractText, getDocumentProxy } from "https://esm.sh/unpdf@0.12.1";
import { encodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// In-isolate safety cap. A Deno edge isolate is bounded at ~256MB; zip-based
// formats (docx/pptx/xlsx) inflate to several times the file size in memory, so
// we refuse files that would OOM the isolate rather than crash mid-parse.
const SAFE_PARSE_BYTES = 40 * 1024 * 1024; // 40 MB

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

interface ParseOutput {
  parsed_content: string;
  parsed_content_format: "markdown";
  chunk_count: number;
  metadata: { page_count: number | null; parser_used: string; warnings: string[] };
}

function normalizeText(s: string): string {
  return s
    // strip control chars except tab/newline
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function decode(bytes: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

// ---- CSV → markdown table -----------------------------------------------------
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else inQ = false;
      } else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

function csvToMarkdown(text: string): string {
  const lines = text.split(/\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return "";
  const rows = lines.map(parseCsvLine);
  const cols = Math.max(...rows.map((r) => r.length));
  const pad = (r: string[]) => Array.from({ length: cols }, (_, i) => (r[i] ?? "").trim().replace(/\|/g, "\\|"));
  const header = pad(rows[0]);
  const sep = header.map(() => "---");
  const body = rows.slice(1).map(pad);
  return [`| ${header.join(" | ")} |`, `| ${sep.join(" | ")} |`, ...body.map((r) => `| ${r.join(" | ")} |`)].join("\n");
}

// ---- XLSX/XLS → markdown tables per sheet ------------------------------------
function xlsxToMarkdown(bytes: Uint8Array): { md: string; sheets: number } {
  const wb = XLSX.read(bytes, { type: "array" });
  const parts: string[] = [];
  for (const name of wb.SheetNames) {
    const csv = XLSX.utils.sheet_to_csv(wb.Sheets[name]);
    const table = csvToMarkdown(csv);
    parts.push(`## ${name}\n\n${table || "_(empty sheet)_"}`);
  }
  return { md: parts.join("\n\n"), sheets: wb.SheetNames.length };
}

// ---- DOCX → markdown (extract paragraph text from word/document.xml) ----------
async function docxToMarkdown(bytes: Uint8Array): Promise<{ md: string; paras: number }> {
  const zip = await JSZip.loadAsync(bytes);
  const docXml = zip.file("word/document.xml");
  if (!docXml) throw new Error("docx missing word/document.xml");
  const xml = await docXml.async("string");
  // Each <w:p> is a paragraph; <w:t> holds text runs.
  const paraMatches = xml.match(/<w:p\b[\s\S]*?<\/w:p>/g) || [];
  const paras: string[] = [];
  for (const p of paraMatches) {
    const runs = [...p.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((m) => decodeXmlEntities(m[1]));
    const line = runs.join("").trim();
    if (line) paras.push(line);
  }
  return { md: paras.join("\n\n"), paras: paras.length };
}

// ---- PPTX → markdown (slide text + speaker notes) ----------------------------
async function pptxToMarkdown(bytes: Uint8Array): Promise<{ md: string; slides: number }> {
  const zip = await JSZip.loadAsync(bytes);
  const slidePaths = Object.keys(zip.files)
    .filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p))
    .sort((a, b) => slideNum(a) - slideNum(b));
  const parts: string[] = [];
  for (let i = 0; i < slidePaths.length; i++) {
    const xml = await zip.file(slidePaths[i])!.async("string");
    const texts = [...xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((m) => decodeXmlEntities(m[1]).trim()).filter(Boolean);
    const notesPath = `ppt/notesSlides/notesSlide${slideNum(slidePaths[i])}.xml`;
    let notes = "";
    const notesFile = zip.file(notesPath);
    if (notesFile) {
      const nxml = await notesFile.async("string");
      const ntexts = [...nxml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((m) => decodeXmlEntities(m[1]).trim()).filter(Boolean);
      notes = ntexts.join(" ").trim();
    }
    let block = `## Slide ${i + 1}\n\n${texts.length ? texts.join("\n") : "_(no text)_"}`;
    if (notes) block += `\n\n**Speaker notes:** ${notes}`;
    parts.push(block);
  }
  return { md: parts.join("\n\n"), slides: slidePaths.length };
}

function slideNum(path: string): number {
  const m = path.match(/(\d+)\.xml$/);
  return m ? parseInt(m[1], 10) : 0;
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

// ---- OCR (rasterize with mupdf-wasm + read with a Lovable AI vision model) ----
// Default DPI 150 (scale = dpi/72). Pages are OCR'd through a bounded concurrency
// pool with exponential backoff on 429s. The gateway is the same trusted AI path
// the agent already uses — NO third-party OCR provider is contacted.
const OCR_DPI = 150;
const OCR_MODEL = "openai/gpt-5.5";
const OCR_CONCURRENCY = 6;
const OCR_MAX_RETRIES = 5;
const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const OCR_PROMPT =
  "Extract ALL text from this page verbatim. Preserve reading order. Render any " +
  "tables as GitHub-flavored markdown tables. Do NOT summarize, paraphrase, " +
  "translate, or add commentary. Output only the page's text content as markdown. " +
  "If the page has no readable text, output an empty string.";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function ocrImage(b64png: string): Promise<string> {
  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key) throw Object.assign(new Error("LOVABLE_API_KEY not configured"), { code: "ocr_unconfigured" });

  let lastErr = "";
  for (let attempt = 0; attempt < OCR_MAX_RETRIES; attempt++) {
    const res = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OCR_MODEL,
        messages: [
          { role: "system", content: "You are a precise OCR engine. You transcribe document images exactly." },
          {
            role: "user",
            content: [
              { type: "text", text: OCR_PROMPT },
              { type: "image_url", image_url: { url: `data:image/png;base64,${b64png}` } },
            ],
          },
        ],
      }),
    });

    if (res.status === 429) {
      lastErr = "rate_limited (429)";
      await sleep(Math.min(30_000, 1000 * 2 ** attempt));
      continue;
    }
    if (res.status === 402) {
      throw Object.assign(new Error("AI credits exhausted (402)"), { code: "ocr_payment_required" });
    }
    if (!res.ok) {
      lastErr = `gateway ${res.status}: ${(await res.text().catch(() => "")).slice(0, 300)}`;
      // 5xx — transient; back off and retry. 4xx — fail fast.
      if (res.status >= 500) { await sleep(1000 * 2 ** attempt); continue; }
      throw Object.assign(new Error(lastErr), { code: "ocr_failed" });
    }
    const data = await res.json();
    return (data?.choices?.[0]?.message?.content ?? "").toString();
  }
  throw Object.assign(new Error(`OCR exhausted retries: ${lastErr}`), { code: "ocr_failed" });
}

// Rasterize every page to PNG (mupdf-wasm) and OCR through the gateway. Each page's
// text is prefixed with `--- Page N ---` so page→content attribution survives.
async function ocrPdf(bytes: Uint8Array): Promise<{ md: string; pages: number }> {
  const mupdf: any = await import("npm:mupdf@1.3.4");
  const doc = mupdf.Document.openDocument(bytes, "application/pdf");
  const pageCount: number = doc.countPages();
  const scale = OCR_DPI / 72;
  const results: string[] = new Array(pageCount).fill("");

  let next = 0;
  async function worker() {
    while (true) {
      const i = next++;
      if (i >= pageCount) break;
      const page = doc.loadPage(i);
      const pixmap = page.toPixmap(mupdf.Matrix.scale(scale, scale), mupdf.ColorSpace.DeviceRGB, false);
      const png: Uint8Array = pixmap.asPNG();
      pixmap.destroy?.();
      page.destroy?.();
      const text = (await ocrImage(encodeBase64(png))).trim();
      results[i] = `--- Page ${i + 1} ---\n\n${text}`.trim();
    }
  }

  const pool = Math.min(OCR_CONCURRENCY, Math.max(1, pageCount));
  await Promise.all(Array.from({ length: pool }, () => worker()));
  doc.destroy?.();

  return { md: results.join("\n\n").trim(), pages: pageCount };
}

// ---- PDF → text layer first (unpdf, in-isolate); OCR fallback for scanned PDFs --
async function pdfToMarkdown(bytes: Uint8Array): Promise<{ md: string; pages: number; parser: string }> {
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { text, totalPages } = await extractText(pdf, { mergePages: true });
  const merged = Array.isArray(text) ? text.join("\n\n") : (text as string);
  const cleaned = normalizeText(merged ?? "");

  // Usable text layer → done, no OCR needed.
  if (cleaned.replace(/\s/g, "").length >= 20) {
    return { md: cleaned, pages: totalPages ?? 0, parser: "unpdf" };
  }

  // No text layer → scanned/image PDF. Rasterize + OCR in-boundary via the gateway.
  const ocr = await ocrPdf(bytes);
  return { md: ocr.md, pages: ocr.pages, parser: "mupdf+lovable-ai-ocr" };
}

function extOf(name: string): string {
  const m = name.toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : "";
}

async function parseByType(
  ext: string,
  bytes: Uint8Array,
): Promise<ParseOutput> {
  const warnings: string[] = [];
  switch (ext) {
    case "md": {
      const md = normalizeText(decode(bytes));
      const chunks = (md.match(/^##\s/gm) || []).length + 1;
      return { parsed_content: md, parsed_content_format: "markdown", chunk_count: chunks, metadata: { page_count: null, parser_used: "raw-markdown", warnings } };
    }
    case "csv": {
      const md = normalizeText(csvToMarkdown(decode(bytes)));
      return { parsed_content: md, parsed_content_format: "markdown", chunk_count: 1, metadata: { page_count: null, parser_used: "csv", warnings } };
    }
    case "xlsx":
    case "xls": {
      const { md, sheets } = xlsxToMarkdown(bytes);
      return { parsed_content: normalizeText(md), parsed_content_format: "markdown", chunk_count: sheets, metadata: { page_count: sheets, parser_used: "sheetjs", warnings } };
    }
    case "doc":
    case "docx": {
      if (ext === "doc") warnings.push("legacy .doc binary format has limited support; .docx recommended");
      const { md, paras } = await docxToMarkdown(bytes);
      return { parsed_content: normalizeText(md), parsed_content_format: "markdown", chunk_count: Math.max(1, paras), metadata: { page_count: null, parser_used: "docx-xml", warnings } };
    }
    case "ppt":
    case "pptx": {
      if (ext === "ppt") warnings.push("legacy .ppt binary format has limited support; .pptx recommended");
      const { md, slides } = await pptxToMarkdown(bytes);
      return { parsed_content: normalizeText(md), parsed_content_format: "markdown", chunk_count: Math.max(1, slides), metadata: { page_count: slides, parser_used: "pptx-xml", warnings } };
    }
    case "pdf": {
      // Text layer first; OCR fallback (rasterize + gateway vision) for scanned PDFs.
      const { md, pages, parser } = await pdfToMarkdown(bytes);
      const clean = normalizeText(md);
      if (parser === "mupdf+lovable-ai-ocr") warnings.push("scanned/image PDF — text recovered via in-boundary OCR");
      return { parsed_content: clean, parsed_content_format: "markdown", chunk_count: Math.max(1, pages), metadata: { page_count: pages, parser_used: parser, warnings } };
    }
    default:
      throw Object.assign(new Error("unsupported_type"), { code: "unsupported_type", details: `Unsupported extension: .${ext}` });
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    // --- Auth: caller must be an admin (same allow-list as /admin/api-credits) ---
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);

    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: userErr } = await supabaseAuth.auth.getUser();
    if (userErr || !user) return json({ error: "unauthorized" }, 401);

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: roleRow } = await supabaseAdmin
      .from("user_roles").select("role")
      .eq("user_id", user.id).eq("role", "admin").maybeSingle();
    if (!roleRow) return json({ error: "forbidden: admin role required" }, 403);

    // --- Input ---
    const body = await req.json().catch(() => ({}));
    const storage_path = typeof body?.storage_path === "string" ? body.storage_path : "";
    const original_filename = typeof body?.original_filename === "string" ? body.original_filename : "";
    if (!storage_path || !original_filename) {
      return json({ error: "bad_request", details: "storage_path and original_filename are required" }, 400);
    }
    const ext = extOf(original_filename);
    const allowed = ["pdf", "ppt", "pptx", "xlsx", "xls", "csv", "md", "doc", "docx"];
    if (!allowed.includes(ext)) return json({ error: "unsupported_type", details: `Unsupported extension: .${ext}` }, 400);

    // --- Download original from storage (service role) ---
    const { data: file, error: dlErr } = await supabaseAdmin.storage.from("roadmap-uploads").download(storage_path);
    if (dlErr || !file) return json({ error: "download_failed", details: dlErr?.message ?? "no file" }, 404);

    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.byteLength > SAFE_PARSE_BYTES) {
      return json({
        error: "file_too_large_to_parse",
        details: `File is ${(bytes.byteLength / 1048576).toFixed(1)}MB. In-isolate parsing is capped at ${SAFE_PARSE_BYTES / 1048576}MB to stay within the edge runtime's 256MB memory limit.`,
      }, 413);
    }

    // --- Parse to completion (no in-code timeout; runs as long as the platform allows) ---
    let result: ParseOutput;
    try {
      result = await parseByType(ext, bytes);
    } catch (e: any) {
      const code = e?.code;
      if (code === "ocr_payment_required") return json({ error: "ocr_payment_required", details: "AI credits are exhausted — add credits to run OCR on scanned PDFs." }, 402);
      if (code === "ocr_unconfigured") return json({ error: "ocr_unconfigured", details: "OCR is not configured (missing AI key)." }, 503);
      if (code === "ocr_failed") return json({ error: "parse_failed", details: `OCR failed: ${e.message}` }, 422);
      if (code === "unsupported_type") return json({ error: "unsupported_type", details: e.details }, 400);
      console.error("[parse-roadmap-document] parse error:", e?.message, e);
      return json({ error: "parse_failed", details: String(e?.message ?? e) }, 422);
    }

    if (!result.parsed_content || result.parsed_content.trim().length === 0) {
      return json({ error: "parse_failed", details: "parser produced empty content" }, 422);
    }

    return json(result, 200);
  } catch (e: any) {
    console.error("[parse-roadmap-document] error:", e?.message, e);
    return json({ error: "internal_error", details: String(e?.message ?? e) }, 500);
  }
});
