// D7 regression tests for the D6 invariants:
//   1. semantic_completeness  (truncated tail / open table row)
//   2. evidence_utilization   ("not evidenced" near a manifest slug)
//   3. conditional_section T1 (Full Product comparison missing Community Sentiment)
//   4. conditional_section T3 (narrow draft cites community source, no section)
//   5. reference_symmetry     (comparison Sources missing a party hostname)
//
// We exercise `detectViolations` directly so the suite stays offline (no
// LLM, no judge call). The function is exported from response-contract.ts.

import { assert, assertEquals } from "jsr:@std/assert@1.0.0";
import { detectViolations, type ContractContext } from "../response-contract.ts";
import type { QueryIntent } from "../query-intent.ts";

const baseIntent: QueryIntent = {
  scope: "broad",
  entities: [],
  asksCommunity: false,
  asksMedia: false,
  asksComparison: false,
  competitors: ["Anaplan"],
  depthExpected: "medium",
  type: "comparison",
};

const baseCtx: ContractContext = {
  competitor: "Anaplan",
  category: "EPM",
  subCategory: "Full Product",
};

Deno.test("D6.1 semantic_completeness — mid-sentence cut is blocked", () => {
  const draft = `## Findings
This is a long enough paragraph to exceed the 60 word threshold. ${"Lorem ipsum dolor sit amet ".repeat(20)}
Additionally, Anaplan is marketing a suite of`;
  const v = detectViolations(draft, baseIntent, baseCtx);
  const sc = v.filter((x) => x.rule === "semantic_completeness");
  assert(sc.length >= 1, "should flag mid-sentence cut");
  assertEquals(sc[0].severity, "block");
});

Deno.test("D6.1 semantic_completeness — open markdown table row is blocked", () => {
  const draft = `## Comparison
${"word ".repeat(70)}
| Capability | Anaplan | Adaptive |
| ---------- | ------- | -------- |
| Reporting  | XL Reporting Services | Office Connect`;
  const v = detectViolations(draft, baseIntent, baseCtx);
  const sc = v.filter((x) => x.rule === "semantic_completeness");
  assert(sc.length >= 1, "should flag open table row");
});

Deno.test("D6.2 evidence_utilization — 'not evidenced' near manifest slug is blocked", () => {
  const draft = `## Excel and PowerPoint
${"filler ".repeat(70)}
Anaplan provides an Excel add-in and XL reporting services capability, but specific Excel add-in details are not evidenced in public documentation.`;
  const ctx: ContractContext = {
    ...baseCtx,
    evidenceManifest: [
      {
        title: "Anaplan XL Reporting Services",
        url: "https://help.anaplan.com/anaplan-xl-reporting-services",
        slug: "anaplan-xl-reporting-services",
      },
    ],
  };
  const v = detectViolations(draft, baseIntent, ctx);
  const eu = v.filter((x) => x.rule === "evidence_utilization");
  assert(eu.length >= 1, "should flag ignored manifest evidence");
  assertEquals(eu[0].severity, "block");
});

Deno.test("D5/D6 trigger T1 — Full Product comparison missing Community Sentiment is blocked", () => {
  const draft = `## Executive Summary
${"Anaplan competes with Workday Adaptive Planning across enterprise FP&A. ".repeat(20)}
## Sources
- https://anaplan.com/products
- https://workday.com/adaptive`;
  const intent: QueryIntent = { ...baseIntent, type: "comparison", scope: "broad", asksComparison: true };
  const v = detectViolations(draft, intent, baseCtx);
  const cs = v.filter((x) => x.rule === "conditional_section");
  assert(cs.length >= 1, "Full Product comparison must require Community Sentiment");
});

Deno.test("D5/D6 trigger T3 — narrow draft cites community source but no section is blocked", () => {
  const draft = `## Anaplan ALM
${"ALM is the Application Lifecycle Management capability for Anaplan. ".repeat(15)}
Per discussions on https://community.anaplan.com/discussion/12345/alm-explained users have reported friction with promotions.`;
  const intent: QueryIntent = { ...baseIntent, type: "feature_deep_dive", scope: "narrow", entities: ["ALM"] };
  const v = detectViolations(draft, intent, baseCtx);
  const cs = v.filter((x) => x.rule === "conditional_section");
  assert(cs.length >= 1, "narrow draft citing community source needs Community Sentiment summary");
});

Deno.test("D6.3 reference_symmetry — comparison Sources missing a party hostname is blocked", () => {
  const draft = `## Comparison
${"Workday Adaptive Planning vs Anaplan across reporting and modeling. ".repeat(15)}
## Sources
- https://anaplan.com/products/intelligent-planning
- https://anaplan.com/blog/anaplan-acquires-fluence-technologies`;
  const intent: QueryIntent = { ...baseIntent, type: "comparison", asksComparison: true };
  const ctx: ContractContext = { ...baseCtx, comparisonHostnames: ["anaplan.com"] };
  const v = detectViolations(draft, intent, ctx);
  const rs = v.filter((x) => x.rule === "reference_symmetry");
  assert(rs.length >= 1, "should flag missing workday.com in Sources");
  assertEquals(rs[0].severity, "block");
});

Deno.test("D6.3 reference_symmetry — both parties present passes", () => {
  const draft = `## Comparison
${"Workday Adaptive Planning vs Anaplan across reporting and modeling. ".repeat(15)}
## Sources
- https://anaplan.com/products/intelligent-planning
- https://www.workday.com/products/adaptive-planning.html`;
  const intent: QueryIntent = { ...baseIntent, type: "comparison", asksComparison: true };
  const ctx: ContractContext = { ...baseCtx, comparisonHostnames: ["anaplan.com"] };
  const v = detectViolations(draft, intent, ctx);
  const rs = v.filter((x) => x.rule === "reference_symmetry");
  assertEquals(rs.length, 0, "balanced sources should not trip reference_symmetry");
});
