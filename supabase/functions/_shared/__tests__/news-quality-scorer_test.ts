// Fixture-driven regression suite for the LLM news quality gate.
// Each fixture is a real-world example surfaced during the manual audit.
// Pass criteria: at least 14/16 fixtures classified correctly.
//
// This test makes a live call to the Lovable AI Gateway. It requires
// LOVABLE_API_KEY to be set in the environment (it is in CI / sandbox).
// It is skipped automatically when the key is missing.

import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { gateNewsItems, type NewsCandidate } from "../news-quality-scorer.ts";

interface Fixture extends NewsCandidate {
  label: string;
  expected: "accept" | "reject";
}

const FIXTURES: Fixture[] = [
  // ---- Should ACCEPT (real product / strategic news) ----
  {
    label: "Anaplan April 2026 release",
    url: "https://www.anaplan.com/blog/anaplan-april-2026-release/",
    title: "Anaplan April 2026 Release: New planning capabilities and AI features",
    content: "Anaplan today announced its April 2026 release with new connected planning capabilities, AI-driven forecasting, and expanded integrations.",
    detectedCompetitor: "Anaplan",
    expected: "accept",
  },
  {
    label: "Oracle SCM 26B",
    url: "https://www.oracle.com/news/announcement/oracle-supply-chain-26b-2026.html",
    title: "Oracle Fusion Cloud SCM 26B introduces AI-powered supply planning",
    content: "Oracle today announced the 26B update to Oracle Fusion Cloud Supply Chain Management, including new AI agents for demand planning.",
    detectedCompetitor: "Oracle EPM",
    expected: "accept",
  },
  {
    label: "SAP Joule Q1",
    url: "https://news.sap.com/2026/01/sap-joule-q1-update/",
    title: "SAP Joule Q1 update: agentic AI rolls out across SAP Analytics Cloud",
    content: "SAP today released the Q1 update for Joule, adding agentic AI capabilities to SAP Analytics Cloud and SuccessFactors.",
    detectedCompetitor: "SAP Analytics Cloud",
    expected: "accept",
  },
  {
    label: "SAP→Dremio acquisition",
    url: "https://news.sap.com/2026/sap-acquires-dremio/",
    title: "SAP to acquire Dremio to expand data lakehouse capabilities",
    content: "SAP announced today it has signed a definitive agreement to acquire Dremio, a data lakehouse platform, to strengthen SAP Datasphere.",
    detectedCompetitor: "SAP Analytics Cloud",
    expected: "accept",
  },
  {
    label: "Workiva NextGen platform",
    url: "https://www.workiva.com/newsroom/workiva-nextgen-platform-launch",
    title: "Workiva launches NextGen platform with unified financial and ESG reporting",
    content: "Workiva today launched its NextGen platform, unifying financial reporting, ESG, and audit on a single connected data foundation.",
    detectedCompetitor: "Workiva",
    expected: "accept",
  },

  // ---- Should REJECT ----
  {
    label: "Celigo nav menu (Planful in sidebar only)",
    url: "https://docs.celigo.com/hc/en-us/articles/12345-Import-Box-files",
    title: "How to import Box files into your integration | Celigo Help Center",
    content: "Step-by-step guide to importing Box files. Related products: NetSuite, Salesforce, Planful, Workday. Last updated 2024.",
    detectedCompetitor: "Planful",
    expected: "reject",
  },
  {
    label: "OneStream earnings scheduling",
    url: "https://www.marketbeat.com/stocks/NASDAQ/OS/earnings/",
    title: "OneStream Inc. (OS) Expected to Announce Quarterly Earnings on Thursday",
    content: "OneStream Inc. (NASDAQ:OS) is expected to release its quarterly earnings results on Thursday. Analysts expect EPS of $0.04.",
    detectedCompetitor: "OneStream",
    expected: "reject",
  },
  {
    label: "OneStream commissioned survey",
    url: "https://www.onestream.com/press/finance-it-survey-2026/",
    title: "OneStream releases survey of 352 finance and IT executives on AI adoption",
    content: "A new OneStream-commissioned survey of 352 finance and IT executives finds 78% plan to expand AI investment in 2026.",
    detectedCompetitor: "OneStream",
    expected: "reject",
  },
  {
    label: "itupdate.id homepage",
    url: "https://itupdate.id/",
    title: "IT Update — Latest IT and tech news in Indonesia",
    content: "Latest news: Jedox releases AI features. Microsoft updates Copilot. Read more on our homepage.",
    detectedCompetitor: "Jedox",
    expected: "reject",
  },
  {
    label: "Oracle Communities security patch thread",
    url: "https://community.oracle.com/discussion/12345/monthly-critical-security-patch-update",
    title: "Monthly Critical Security Patch Update | Oracle Communities",
    content: "Forum discussion about Oracle's monthly critical patch update. User comments below.",
    detectedCompetitor: "Oracle EPM",
    expected: "reject",
  },
  {
    label: "SAP Community category landing",
    url: "https://community.sap.com/t5/technology/pd-p/67838200100800006884",
    title: "SAP Analytics Cloud — Community | SAP Community",
    content: "Welcome to the SAP Analytics Cloud community. Browse discussions, blog posts, and Q&A from SAP customers and partners.",
    detectedCompetitor: "SAP Analytics Cloud",
    expected: "reject",
  },
  {
    label: "CIO topic aggregator",
    url: "https://www.cio.com/article/123456/sap-latest-news-and-insights.html",
    title: "SAP: Latest news and insights | CIO",
    content: "All the latest SAP news, articles, and insights from CIO. Updated continuously.",
    detectedCompetitor: "SAP Analytics Cloud",
    expected: "reject",
  },
  {
    label: "Workiva earnings results",
    url: "https://www.americanbankingnews.com/2026/workiva-earnings-q1-eps-beat/",
    title: "Workiva (NYSE:WK) Releases Earnings Results, Beats Estimates by $0.11 EPS",
    content: "Workiva Inc. (NYSE:WK) reported Q1 earnings of $0.42 per share, beating analyst estimates of $0.31. Revenue was $185M.",
    detectedCompetitor: "Workiva",
    expected: "reject",
  },
  {
    label: "Workiva earnings call transcript",
    url: "https://seekingalpha.com/article/workiva-q1-2026-earnings-call-transcript",
    title: "Workiva Inc. (WK) Q1 2026 Earnings Call Transcript",
    content: "Workiva Inc. Q1 2026 earnings call transcript. CFO discusses revenue guidance and operating margin.",
    detectedCompetitor: "Workiva",
    expected: "reject",
  },
  {
    label: "Top 10 FP&A tools listicle",
    url: "https://example.com/blog/top-10-fpa-tools-2026",
    title: "Top 10 FP&A tools to watch in 2026",
    content: "Our roundup of the top FP&A tools: 1. Anaplan 2. Pigment 3. Planful 4. Vena 5. Datarails 6. OneStream 7. Workday Adaptive Planning 8. Jedox 9. Board 10. Prophix.",
    detectedCompetitor: "Anaplan",
    expected: "reject",
  },
  {
    label: "Recruiter post",
    url: "https://www.linkedin.com/jobs/view/anaplan-senior-engineer-12345",
    title: "Anaplan is hiring a Senior Software Engineer — apply now",
    content: "Join Anaplan! We're hiring a Senior Software Engineer in San Francisco. Competitive salary, great benefits.",
    detectedCompetitor: "Anaplan",
    expected: "reject",
  },
];

Deno.test({
  name: "news-quality-gate: at least 14/16 fixtures classified correctly",
  ignore: !Deno.env.get("LOVABLE_API_KEY"),
  async fn() {
    const items: NewsCandidate[] = FIXTURES.map(({ label: _l, expected: _e, ...rest }) => rest);
    const result = await gateNewsItems(items, { batchSize: 20 });
    assert(!result.llmUnavailable, "LLM gate must be reachable");
    assert(result.scored.length === FIXTURES.length, `Expected ${FIXTURES.length} scored, got ${result.scored.length}`);

    const passingUrls = new Set(result.passing.map((p) => p.url));
    let correct = 0;
    const failures: string[] = [];
    for (const fx of FIXTURES) {
      const accepted = passingUrls.has(fx.url);
      const ok = (accepted && fx.expected === "accept") || (!accepted && fx.expected === "reject");
      if (ok) {
        correct++;
      } else {
        const s = result.scored.find((x) => x.url === fx.url)?.scores;
        failures.push(
          `[${fx.expected}→${accepted ? "accept" : "reject"}] ${fx.label} — ` +
            (s ? `total=${s.total} subj=${s.subjecthood} genre=${s.genre_fit} subst=${s.substance} indep=${s.independence}` : "no score"),
        );
      }
    }
    console.log(`news-quality-gate fixtures: ${correct}/${FIXTURES.length} correct`);
    if (failures.length) console.log("Failures:\n" + failures.join("\n"));
    assert(correct >= 14, `Only ${correct}/16 fixtures correct (need ≥14). Failures:\n${failures.join("\n")}`);
  },
});
