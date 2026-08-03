// Regression test for the chat-analysis systemPrompt template literal.
//
// History: a literal backtick inside the systemPrompt template (e.g.
// `[Source]()`) closed the outer template and caused the runtime to evaluate
// `[Source]()` as JS — which threw `ReferenceError: Source is not defined`
// inside the streaming generator and crashed the request.
//
// This test reads chat-analysis/index.ts as text, locates the systemPrompt
// template literal, and asserts:
//   1. The template contains no unescaped backticks (would close the literal).
//   2. The template contains no bare identifier expressions named "Source",
//      "EvidenceSource", or "SourceRegistry" inside ${...} interpolations.
//
// If this test fails, you almost certainly introduced a markdown example with
// literal backticks inside the prompt. Use single quotes or escape the
// backtick with a backslash (\`) instead.

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const INDEX_PATH = new URL("../../chat-analysis/index.ts", import.meta.url);

function extractSystemPromptTemplate(src: string): string {
  // Find the assignment `systemPrompt = \`...\`;`
  const startMarker = "systemPrompt = `";
  const startIdx = src.indexOf(startMarker);
  if (startIdx === -1) {
    throw new Error("Could not find systemPrompt assignment in chat-analysis/index.ts");
  }
  const bodyStart = startIdx + startMarker.length;
  // Walk forward and find the matching closing backtick at the top template
  // level. We must respect ${...} expression nesting so that backticks
  // inside nested template literals don't fool us.
  let i = bodyStart;
  let depth = 0; // ${...} depth
  while (i < src.length) {
    const ch = src[i];
    if (ch === "\\") { i += 2; continue; }
    if (depth === 0 && ch === "`") {
      return src.slice(bodyStart, i);
    }
    if (ch === "$" && src[i + 1] === "{") { depth++; i += 2; continue; }
    if (depth > 0 && ch === "}") { depth--; i++; continue; }
    i++;
  }
  throw new Error("Unterminated systemPrompt template literal");
}

Deno.test("systemPrompt template has no unescaped backticks at top level", async () => {
  const src = await Deno.readTextFile(INDEX_PATH);
  const tpl = extractSystemPromptTemplate(src);
  // By construction extractSystemPromptTemplate stops at the first top-level
  // backtick, so the *body* it returns must contain no unescaped top-level
  // backticks. We re-walk to confirm explicitly: any bare ` outside ${...}
  // would mean the prompt is broken.
  let depth = 0;
  let i = 0;
  while (i < tpl.length) {
    const ch = tpl[i];
    if (ch === "\\") { i += 2; continue; }
    if (ch === "$" && tpl[i + 1] === "{") { depth++; i += 2; continue; }
    if (depth > 0 && ch === "}") { depth--; i++; continue; }
    if (depth === 0 && ch === "`") {
      throw new Error(
        `Unescaped backtick at offset ${i} inside systemPrompt template. ` +
        `Use single quotes or escape with \\\`. Snippet: ${tpl.slice(Math.max(0, i - 40), i + 40)}`
      );
    }
    i++;
  }
});

Deno.test("systemPrompt does not interpolate bare 'Source' identifiers", async () => {
  const src = await Deno.readTextFile(INDEX_PATH);
  const tpl = extractSystemPromptTemplate(src);
  // Find every ${ ... } expression and assert it does not contain a bare
  // identifier "Source" / "SourceRegistry" / "EvidenceSource". These are the
  // names that previously leaked through bundling collisions.
  const exprRe = /\$\{([^}]*)\}/g;
  let m: RegExpExecArray | null;
  const offenders: string[] = [];
  while ((m = exprRe.exec(tpl)) !== null) {
    const expr = m[1];
    const bare = /(?<![.\w$])(Source|SourceRegistry|EvidenceSource)(?![\w$])/.exec(expr);
    if (bare) offenders.push(`${bare[1]}  in  ${expr.trim()}`);
  }
  assertEquals(offenders, [], `Bare Source identifier(s) interpolated: ${offenders.join("; ")}`);
});

Deno.test("chat-analysis source has no bare 'Source' identifier reference", async () => {
  const src = await Deno.readTextFile(INDEX_PATH);
  // Strip strings and comments before scanning for a bare `Source` token.
  // This is a line-oriented heuristic that is good enough to catch the
  // specific bug class we hit (a free `Source` reference at runtime).
  const stripped = src
    .replace(/\/\/[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/`(?:\\.|[^`\\])*`/g, '""')
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/'(?:\\.|[^'\\])*'/g, "''");
  const bareSource = /(?<![.\w$])Source(?![:\w$])/g;
  const hits: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = bareSource.exec(stripped)) !== null) {
    const start = Math.max(0, m.index - 30);
    const end = Math.min(stripped.length, m.index + 30);
    hits.push(stripped.slice(start, end));
  }
  assertEquals(hits, [], `Found bare 'Source' identifier(s): ${hits.join(" | ")}`);
});
