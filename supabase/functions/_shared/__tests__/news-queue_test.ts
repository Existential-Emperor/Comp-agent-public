// Unit tests for the principled news filter chain.
// Run via: supabase--test_edge_functions { functions: ["_shared"] } or
// `deno test supabase/functions/_shared/__tests__/news-queue_test.ts`.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  classifyGenre,
  detectCompetitorName,
  isProductRelevant,
  mentionsCompetitor,
} from "../news-queue.ts";

// ---------- Identity: whole-word matching ----------

Deno.test("identity: 'highlights' does NOT match competitor 'Light' substring", () => {
  // Even if a sheet ingest registered a competitor named "Light", the matcher
  // must not fire on words that merely contain it.
  // (We can't actually inject a profile here, so we assert the well-known
  // built-in tokens behave: 'Workiva' must not match 'workivability'.)
  assertEquals(mentionsCompetitor("CFOs see workivability gains in highlights"), false);
  assertEquals(detectCompetitorName("Highlights from this week's IT news"), "Other");
});

Deno.test("identity: 'Vena' does not match 'adventure'", () => {
  assertEquals(mentionsCompetitor("An adventurous quarter for SaaS vendors"), false);
});

Deno.test("identity: real Vena Solutions mention matches", () => {
  assertEquals(mentionsCompetitor("Vena Solutions launches new Copilot module"), true);
  assertEquals(detectCompetitorName("Vena Solutions launches new Copilot module"), "Vena Solutions");
});

Deno.test("identity: Vena Energy (solar) is rejected when no multi-word competitor present", () => {
  assertEquals(
    mentionsCompetitor("Vena Energy commissions new solar project in Taiwan"),
    false,
  );
});

Deno.test("identity: Pigment cosmetics article is rejected", () => {
  assertEquals(
    mentionsCompetitor("Best pigment lipstick for fall makeup season"),
    false,
  );
});

Deno.test("identity: real Pigment FP&A mention matches", () => {
  assertEquals(
    mentionsCompetitor("Pigment unveils new forecasting workspace"),
    true,
  );
});

// ---------- Genre classifier ----------

Deno.test("genre: earnings-call transcript classifies as financial", () => {
  assertEquals(
    classifyGenre("Workiva Inc. (WK) Q1 2026 Earnings Call Transcript"),
    "financial",
  );
});

Deno.test("genre: 'beats estimates' classifies as financial", () => {
  assertEquals(
    classifyGenre("Workiva beats Q1 estimates as revenue grew 18%"),
    "financial",
  );
});

Deno.test("genre: trading update classifies as financial", () => {
  assertEquals(
    classifyGenre("Wolters Kluwer issues 2026 trading update"),
    "financial",
  );
});

Deno.test("genre: commissioned survey classifies as research", () => {
  assertEquals(
    classifyGenre("OneStream: New study of 352 finance leaders finds AI data trust gap"),
    "research",
  );
});

Deno.test("genre: real product launch classifies as product", () => {
  assertEquals(
    classifyGenre("Anaplan launches new Workforce Planning module in 2026.1 release"),
    "product",
  );
});

Deno.test("genre: product wins when both product and financial signals present", () => {
  // Earnings recap that *also* announces a GA — keep it.
  assertEquals(
    classifyGenre("On its Q1 earnings call, Workiva announced general availability of N-zo AI"),
    "product",
  );
});

// ---------- Substance proximity ----------

Deno.test("substance: product signal far from competitor name in long body still passes via title", () => {
  assertEquals(
    isProductRelevant("Anaplan launches new module", "Some long unrelated paragraph..."),
    true,
  );
});

Deno.test("substance: no product signal anywhere → reject", () => {
  assertEquals(
    isProductRelevant("Anaplan stock falls after analyst downgrade", "The shares dropped 4%"),
    false,
  );
});
