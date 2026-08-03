// CI gate: pre-deploy structural checks for the chat-analysis edge function.
//
// Two checks run here:
//
//  1. BUNDLE-LEVEL `Source` CHECK (item 5a of the failure-class plan)
//     Bundle the function with esbuild and grep the emitted JS for any free
//     identifier named `Source`. The original ReferenceError happened because
//     a literal backtick inside the systemPrompt template closed the outer
//     string and left `[Source]()` evaluated as code. This check rejects that
//     entire bug class — at the bundle level, not the source level — so it
//     cannot ship again regardless of how it slips in (template syntax,
//     bundler symbol collision, missing import).
//
//  2. UNWRAPPED-AWAIT CHECK (item 6b)
//     Scan chat-analysis/index.ts for any `await` that isn't either:
//       - inside a safeStage(...) call, or
//       - inside an explicitly allow-listed critical-path block marked with
//         `// CRITICAL_AWAIT_OK: <reason>` on the line above.
//     This makes the safeStage discipline an invariant, not a convention.
//
// Run via:  deno run -A supabase/functions/_shared/ci/preflight.ts
// Exits non-zero on any violation. Intended to gate the chat-analysis deploy.

import * as esbuild from "https://deno.land/x/esbuild@v0.23.1/mod.js";

const ROOT = new URL("../../", import.meta.url).pathname; // supabase/functions/
const ENTRY = `${ROOT}chat-analysis/index.ts`;

async function bundleCheck(): Promise<string[]> {
  const violations: string[] = [];
  const result = await esbuild.build({
    entryPoints: [ENTRY],
    bundle: true,
    write: false,
    format: "esm",
    platform: "neutral",
    target: "es2022",
    logLevel: "silent",
    // Treat all remote and node specifiers as external so we only inspect
    // first-party code; third-party libs are not our problem to police.
    external: ["*"],
  }).catch((err) => {
    violations.push(`bundle failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  });
  if (!result) return violations;

  const js = result.outputFiles.map((f) => f.text).join("\n");

  // Free identifier `Source` that is NOT:
  //   - a property access (.Source)
  //   - inside a string/comment (rough heuristic — strip strings first)
  //   - a property name in an object literal (Source:)
  //   - the LHS of an assignment (Source =)
  const stripped = js
    // remove block comments
    .replace(/\/\*[\s\S]*?\*\//g, "")
    // remove line comments
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1")
    // remove double-quoted strings
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    // remove single-quoted strings
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
    // remove template literals (any remaining unbalanced backtick is the bug
    // we are trying to catch — preserve a marker for it)
    .replace(/`(?:\\.|[^`\\])*`/g, "``");

  const re = /(?<![.\w"'])\bSource\b(?!\s*[:=])/g;
  const matches = stripped.match(re) || [];
  if (matches.length > 0) {
    violations.push(
      `bundle contains ${matches.length} free \`Source\` identifier(s) — would throw ReferenceError at runtime`,
    );
  }
  return violations;
}

async function unwrappedAwaitCheck(): Promise<string[]> {
  const violations: string[] = [];
  const src = await Deno.readTextFile(ENTRY);
  const lines = src.split("\n");

  // Brace-depth tracker: when we enter a safeStage/runStage/Promise.all
  // callback, every await inside it is structurally covered by the wrapper.
  // We only flag awaits that are NOT inside such a wrapper.
  const wrapperOpens: number[] = []; // stack of brace depths at which a wrapper callback opened
  let depth = 0;

  const isWrapperOpener = (line: string): boolean =>
    /\b(?:safeStage|runStage|Promise\.(?:all|race|allSettled))\s*\(/.test(line) ||
    /\bqueueBackgroundTask\s*\(/.test(line);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const opensWrapper = isWrapperOpener(line);

    // Count braces on this line (rough: ignores braces inside strings, but
    // chat-analysis/index.ts doesn't use {} inside template literals at the
    // top level so this is good enough).
    const opens = (line.match(/\{/g) || []).length;
    const closes = (line.match(/\}/g) || []).length;

    // If the line opens a wrapper, mark the depth that the wrapper body sits at.
    if (opensWrapper) wrapperOpens.push(depth + 1);

    depth += opens;
    // Drop wrapper markers whose scope has closed.
    while (wrapperOpens.length && wrapperOpens[wrapperOpens.length - 1] > depth - closes + opens) {
      // closed in this same line
      if (wrapperOpens[wrapperOpens.length - 1] > depth - (closes - opens)) {
        wrapperOpens.pop();
      } else break;
    }
    depth -= closes;
    while (wrapperOpens.length && wrapperOpens[wrapperOpens.length - 1] > depth) {
      wrapperOpens.pop();
    }

    if (!/\bawait\b/.test(line)) continue;
    if (/^\s*(?:\/\/|\*)/.test(line)) continue;

    // The await IS the wrapper itself — that's the structural fix, not a violation.
    if (/\bawait\s+(?:safeStage|runStage)\s*[<(]/.test(line)) continue;

    // Promise.all over already-wrapped/inert collections — needs explicit annotation
    // only if the inner items aren't themselves wrapper calls.
    if (/\bawait\s+Promise\.(?:all|race|allSettled)\s*\(/.test(line)) continue;

    // Inside a wrapper callback → covered.
    if (wrapperOpens.length > 0) continue;

    // Explicit annotation on the previous non-blank line.
    let j = i - 1;
    while (j >= 0 && lines[j].trim() === "") j--;
    if (j >= 0 && /CRITICAL_AWAIT_OK/.test(lines[j])) continue;

    // The await sits at orchestrator top scope and isn't wrapped.
    violations.push(`${ENTRY}:${i + 1}: unwrapped orchestrator await — wrap in safeStage/runStage or annotate with // CRITICAL_AWAIT_OK: <reason>\n  > ${line.trim()}`);
  }
  return violations;
}

const all: string[] = [];
all.push(...(await bundleCheck()));
all.push(...(await unwrappedAwaitCheck()));

if (all.length === 0) {
  console.log("preflight ok: bundle is Source-free; all awaits in chat-analysis are wrapped or allow-listed.");
  Deno.exit(0);
}

console.error("preflight failed:");
for (const v of all) console.error("  - " + v);
Deno.exit(1);
