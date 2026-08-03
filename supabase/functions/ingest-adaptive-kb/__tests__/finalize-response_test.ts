import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { EvidenceSourceRegistry } from "../../_shared/evidence-source-registry.ts";
import { finalizeResponse } from "../../_shared/finalize-response.ts";

function emptyRegistry() { return new EvidenceSourceRegistry(); }

Deno.test("strips empty-href [Source]() placeholders", () => {
  const reg = emptyRegistry();
  const out = finalizeResponse({
    markdown: "Adaptive supports rolling forecasts [Source]() and scenarios [Source]( ).",
    registry: reg,
    allowedMediaUrls: new Set(),
  });
  assert(!out.markdown.includes("[Source]()"));
  assert(!out.markdown.includes("[Source]( )"));
  assertEquals(out.diagnostics.emptyCitationsStripped, 2);
});

Deno.test("repairs relative [label](/path) using known URLs in registry", () => {
  const reg = emptyRegistry();
  reg.register({ kind: "web", url: "https://anaplan.com/products/p1" });
  const out = finalizeResponse({
    markdown: "See [pricing](/p1) for details.",
    registry: reg,
    allowedMediaUrls: new Set(),
  });
  assert(out.markdown.includes("https://anaplan.com/products/p1"));
  assertEquals(out.diagnostics.relativeLinksRepaired, 1);
});

Deno.test("strips relative links that cannot be recovered (keeps label)", () => {
  const reg = emptyRegistry();
  const out = finalizeResponse({
    markdown: "See [pricing](/unknown-path) for details.",
    registry: reg,
    allowedMediaUrls: new Set(),
  });
  assert(out.markdown.includes("pricing"));
  assert(!out.markdown.includes("/unknown-path"));
  assertEquals(out.diagnostics.relativeLinksStripped, 1);
});

Deno.test("strips fabricated image URLs not in allowed set", () => {
  const reg = emptyRegistry();
  const out = finalizeResponse({
    markdown: "Real: ![ok](https://ok.com/img.png)\nFake: ![bad](https://hallucinated.com/img.png)",
    registry: reg,
    allowedMediaUrls: new Set(["https://ok.com/img.png"]),
  });
  assert(out.markdown.includes("https://ok.com/img.png"));
  assert(!out.markdown.includes("hallucinated.com"));
  assertEquals(out.diagnostics.fabricatedImagesStripped, 1);
});

Deno.test("scrubs visual media URLs from ## Sources section", () => {
  const reg = emptyRegistry();
  const md = [
    "Body content",
    "",
    "## Sources",
    "- https://example.com/article",
    "- https://example.com/screenshot.png",
    "- https://youtube.com/watch?v=abc",
  ].join("\n");
  const out = finalizeResponse({ markdown: md, registry: reg, allowedMediaUrls: new Set() });
  assert(out.markdown.includes("https://example.com/article"));
  assert(!out.markdown.includes("screenshot.png"));
  assert(!out.markdown.includes("youtube.com/watch"));
  assert(out.diagnostics.visualUrlsScrubbedFromSources >= 2);
});

Deno.test("normalizes inline [Source](url) using registry resolve", () => {
  const reg = emptyRegistry();
  reg.register({ kind: "web", url: "https://anaplan.com/features/alm" });
  const out = finalizeResponse({
    markdown: "ALM is supported [Source](https://anaplan.com/features/alm).",
    registry: reg,
    allowedMediaUrls: new Set(),
  });
  // The deep URL must be preserved (registry-known) and not dropped.
  // The deep URL must be preserved (registry-known) and not dropped.
  assert(out.markdown.includes("https://anaplan.com/features/alm"));
});

Deno.test("drops domain-only inline citations", () => {
  const reg = emptyRegistry();
  const out = finalizeResponse({
    markdown: "Anaplan is great [Source](https://anaplan.com/).",
    registry: reg,
    allowedMediaUrls: new Set(),
  });
  assert(!out.markdown.includes("https://anaplan.com/"));
  assert(out.markdown.includes("Anaplan is great Source"));
  assertEquals(out.diagnostics.inlineCitationsDropped, 1);
});

Deno.test("appends canonical Sources block when none exists", () => {
  const reg = emptyRegistry();
  reg.register({ kind: "web", url: "https://example.com/article", title: "Article" });
  const out = finalizeResponse({
    markdown: "Some body content with no sources block.",
    registry: reg,
    allowedMediaUrls: new Set(),
    appendCanonicalSources: true,
  });
  assert(out.markdown.includes("## Sources"));
  assert(out.markdown.includes("https://example.com/article"));
  assertEquals(out.diagnostics.canonicalSourcesAppended, true);
});

Deno.test("does not throw on unusual identifiers in input (regression for ReferenceError)", () => {
  const reg = emptyRegistry();
  // The exact failure pattern: bare 'Source' tokens, mixed citations, weird whitespace.
  const md = "Source\n[Source]()\n[Source](  )\n[Source](/x)\nText [Source](https://a.com/path)";
  const out = finalizeResponse({ markdown: md, registry: reg, allowedMediaUrls: new Set() });
  assert(typeof out.markdown === "string");
  assert(out.diagnostics.emptyCitationsStripped >= 2);
});
