/**
 * Shared community business rules
 * Used by fetch-community, firecrawl-reddit, and reddit-quality-gate
 */

export const COMPETITOR_NAMES = [
  "Anaplan", "Planful", "Vena Solutions", "Pigment", "Datarails",
  "Jedox", "Board International", "OneStream", "Prophix", "Workiva",
  "Oracle EPM", "SAP Analytics Cloud", "IBM Planning Analytics",
  "Wolters Kluwer CCH Tagetik", "Workday Adaptive Planning",
];
export const COMPETITOR_NAMES_LOWER = COMPETITOR_NAMES.map((c) => c.toLowerCase());

export const SOCIAL_DOMAINS = [
  "reddit.com", "linkedin.com", "twitter.com", "x.com",
  "facebook.com", "youtube.com", "quora.com",
];

export const COMPETITOR_ALIASES: Record<string, string> = {
  "anaplan": "Anaplan", "planful": "Planful", "vena": "Vena Solutions",
  "pigment": "Pigment", "datarails": "Datarails", "jedox": "Jedox",
  "board international": "Board International", "onestream": "OneStream",
  "prophix": "Prophix", "workiva": "Workiva", "oracle epm": "Oracle EPM",
  "oracle planning": "Oracle EPM", "oracle cloud epm": "Oracle EPM",
  "sap analytics cloud": "SAP Analytics Cloud", "sap analytics": "SAP Analytics Cloud",
  "ibm planning analytics": "IBM Planning Analytics", "ibm planning": "IBM Planning Analytics",
  "cch tagetik": "Wolters Kluwer CCH Tagetik", "tagetik": "Wolters Kluwer CCH Tagetik",
  "adaptive planning": "Workday Adaptive Planning", "workday adaptive": "Workday Adaptive Planning",
  "workday 20": "Workday Adaptive Planning", "workday release": "Workday Adaptive Planning",
};

export const TARGET_COMPETITOR_SEARCH_ALIASES: Record<string, string[]> = {
  "Workday Adaptive Planning": ["Workday Adaptive Planning", "Adaptive Planning", "Workday Adaptive"],
};

export const COMMUNITY_REVIEW_SIGNALS = [
  "review", "experience", "switched", "migrated", "moving from", "moved from",
  "pros and cons", "honest opinion", "feedback", "recommend", "recommendation",
  "love it", "hate it", "frustrated", "amazing", "terrible", "worst", "best",
  "implementation", "went live", "go live", "user experience", "customer support",
  "we use", "we chose", "we switched", "i use", "i chose", "using it for",
  "anyone use", "anyone tried", "thoughts on", "opinion on", "how is",
  "compared to", "vs ", "versus", "alternative to", "better than", "worse than",
  "demo", "trial", "poc ", "proof of concept", "evaluated", "shortlist",
  "complaint", "issue with", "problem with", "bug", "broken",
  "pricing", "cost", "expensive", "affordable", "roi", "value for money",
  "ama", "ask me", "in my experience",
];

export const GENERIC_FPA_SIGNALS = [
  "what is fp&a", "what is epm", "guide to fp&a", "introduction to",
  "best practices for fp&a", "fp&a career", "fp&a salary", "fp&a interview",
  "how to become", "fp&a certification", "fp&a skills", "fp&a trends",
  "the future of fp&a", "fp&a 101", "beginner", "getting started with fp&a",
  "fp&a job", "hiring fp&a", "fp&a team structure", "fp&a process",
  "digital transformation in finance", "finance transformation",
];

export const OFFICIAL_SLUGS = [
  "anaplan", "planful", "pigment", "datarails", "jedox", "onestream", "prophix",
  "workiva", "oracle", "sap", "ibm", "board-international", "boardinternational",
  "vena-solutions", "venasolutions", "wolters-kluwer", "cch-tagetik", "workday",
  "onesoftware", "prophixsoftware", "jedoxag",
];

export function mentionsCompetitor(title: string, content: string | undefined): boolean {
  const text = `${title} ${content || ""}`.toLowerCase();
  return (
    COMPETITOR_NAMES_LOWER.some((name) => text.includes(name)) ||
    Object.keys(COMPETITOR_ALIASES).some((alias) => text.includes(alias))
  );
}

export function isCommunityRelevant(title: string, content: string | undefined): boolean {
  const text = `${title} ${content || ""}`.toLowerCase();
  const isGeneric = GENERIC_FPA_SIGNALS.some((sig) => text.includes(sig));
  if (isGeneric) {
    const hasReviewSignal = COMMUNITY_REVIEW_SIGNALS.some((sig) => text.includes(sig));
    if (!hasReviewSignal) return false;
  }
  return COMMUNITY_REVIEW_SIGNALS.some((sig) => text.includes(sig));
}

export function isIrrelevantUrl(url: string): boolean {
  const lower = url.toLowerCase();
  if (lower.includes("/careers") || lower.includes("/jobs")) return true;
  if (lower.includes("remote-work-statistics")) return true;
  if (lower.includes("/about/newsroom") && !lower.includes("product")) return true;
  return false;
}

export function isOfficialCompetitorSocial(url: string): boolean {
  try {
    const lower = url.toLowerCase();
    const urlObj = new URL(lower);
    const host = urlObj.hostname;
    const path = urlObj.pathname;
    if (host.includes("linkedin.com") && path.includes("/company/")) {
      return OFFICIAL_SLUGS.some((slug) => path.includes(`/company/${slug}`));
    }
    if (host.includes("youtube.com") && (path.startsWith("/@") || path.startsWith("/c/") || path.startsWith("/channel/"))) {
      return OFFICIAL_SLUGS.some((slug) => path.includes(slug));
    }
    if (host.includes("twitter.com") || host.includes("x.com")) {
      const handle = path.split("/")[1]?.toLowerCase() || "";
      return OFFICIAL_SLUGS.some((slug) => handle.includes(slug));
    }
    return false;
  } catch { return false; }
}

export function isLikelyEnglish(title: string, content: string): boolean {
  const text = `${title} ${(content || "").slice(0, 500)}`;
  if (!text.trim()) return true;
  const asciiCount = [...text].filter((c) => c.charCodeAt(0) < 128).length;
  if (asciiCount / text.length < 0.7) return false;
  const lower = text.toLowerCase();
  const englishWords = ["the ", " and ", " for ", " with ", " that ", " this ", " from ", " are ", " was ", " has ", " have ", " will ", " can ", " its ", " our ", " their "];
  const matchCount = englishWords.filter((w) => lower.includes(w)).length;
  if (matchCount < 2 && text.length > 50) return false;
  return true;
}

export function detectCompetitorName(title: string, content: string | undefined): string {
  const text = `${title} ${content || ""}`.toLowerCase();
  for (let i = 0; i < COMPETITOR_NAMES_LOWER.length; i++) {
    if (text.includes(COMPETITOR_NAMES_LOWER[i])) return COMPETITOR_NAMES[i];
  }
  for (const [alias, name] of Object.entries(COMPETITOR_ALIASES)) {
    if (text.includes(alias)) return name;
  }
  return "Other";
}

const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

export function parseDateLoose(input?: string | null): string | null {
  if (!input) return null;
  const d = new Date(input);
  if (!isNaN(d.getTime())) return d.toISOString();
  const text = input.toLowerCase();
  const monthYear = text.match(new RegExp(`(${MONTHS.join("|")})\\s+(20\\d{2})`, "i"));
  if (monthYear) {
    const monthIdx = MONTHS.indexOf(monthYear[1].toLowerCase());
    const year = Number(monthYear[2]);
    if (monthIdx >= 0 && year >= 2000 && year <= 2100) {
      return new Date(Date.UTC(year, monthIdx, 1)).toISOString();
    }
  }
  const yearOnly = text.match(/(?:released|release|update|updates|in)\s+(20\d{2})/i) || text.match(/\b(20\d{2})\b/);
  if (yearOnly) {
    const year = Number(yearOnly[1]);
    if (year >= 2000 && year <= 2100) return new Date(Date.UTC(year, 0, 1)).toISOString();
  }
  return null;
}

/**
 * Estimate Reddit post date from base36 post ID.
 * Returns ISO string or null if outside trailing 365-day window.
 */
export function estimateRedditDate(url: string): string | null {
  try {
    const match = url.match(/\/comments\/([a-z0-9]+)/i);
    if (!match) return null;
    const idNum = parseInt(match[1], 36);
    const refId = parseInt("1m8jugx", 36);
    const refDate = new Date("2026-03-08T00:00:00Z");
    const idsPerDay = 282434000 / 365;
    const daysDiff = (idNum - refId) / idsPerDay;
    const estimated = new Date(refDate.getTime() + daysDiff * 86400000);
    const nowMs = Date.now();
    const oneYearAgoMs = nowMs - 365 * 86400000;
    if (estimated.getTime() > nowMs) estimated.setTime(nowMs - 5 * 86400000);
    if (estimated.getTime() >= oneYearAgoMs && estimated.getTime() <= nowMs) {
      return estimated.toISOString();
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Build the full set of Reddit-specific community search queries.
 * LinkedIn queries are excluded — this is Reddit-only.
 */
export function buildRedditQueries(targetCompetitor: string | null): string[] {
  const now = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 365);
  const years = new Set<number>();
  for (let y = startDate.getFullYear(); y <= now.getFullYear(); y++) years.add(y);
  const yearStr = Array.from(years).join(" ");

  const queries: string[] = [];

  if (!targetCompetitor) {
    queries.push(
      `site:reddit.com/r/FPandA Anaplan Planful Pigment OneStream review`,
      `site:reddit.com/r/FPandA Vena Datarails Jedox Board International EPM`,
      `site:reddit.com/r/FPandA Oracle EPM SAP Analytics Cloud planning software`,
      `site:reddit.com/r/CFO FP&A software EPM budgeting planning tool`,
      `site:reddit.com "switched from" OR "moving from" OR "migrating from" Anaplan OR Planful OR Pigment OR OneStream`,
      `site:reddit.com "love" OR "hate" OR "frustrated" OR "amazing" Anaplan OR Planful OR Oracle EPM OR SAP Analytics`,
      `site:reddit.com Workday Adaptive Planning review experience opinion`,
      `site:reddit.com "user experience" OR "customer review" OR "honest opinion" EPM FP&A software`,
      `site:reddit.com/r/accounting EPM budgeting forecasting software`,
      `site:reddit.com/r/FinancialPlanning FP&A tool recommendation`,
      `site:reddit.com/r/consulting Anaplan Planful OneStream implementation`,
      `site:reddit.com Anaplan review pros cons experience feedback`,
      `site:reddit.com Planful review pros cons experience feedback`,
      `site:reddit.com OneStream review pros cons experience feedback`,
      `site:reddit.com Pigment FP&A review experience user`,
      `site:reddit.com Vena Solutions review experience user`,
      `site:reddit.com Datarails review experience user`,
      `site:reddit.com Jedox Board International review EPM`,
      `site:reddit.com Oracle EPM Cloud review experience planning`,
      `site:reddit.com SAP Analytics Cloud review planning experience`,
      `site:reddit.com IBM Planning Analytics TM1 review experience`,
      `site:reddit.com Prophix Workiva CCH Tagetik review experience`,
      `site:reddit.com/r/FPandA best FP&A tool recommendation comparison`,
      `site:reddit.com/r/FPandA EPM software pros cons experience`,
      `site:reddit.com Anaplan vs Planful vs Pigment vs OneStream`,
      `site:reddit.com/r/FPandA budgeting forecasting software switched from`,
      `site:reddit.com "worst thing about" OR "best thing about" Anaplan OR Planful OR OneStream OR Pigment`,
      `site:reddit.com/r/FPandA "implementation" OR "went live" OR "go live" EPM`,
      `site:reddit.com "customer support" OR "support team" Anaplan OR Planful OR OneStream`,
    );

    // Month-specific queries
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    for (let m = 0; m < 12; m++) {
      const targetDate = new Date();
      targetDate.setMonth(targetDate.getMonth() - m - 1);
      const monthName = monthNames[targetDate.getMonth()];
      const targetYear = targetDate.getFullYear();
      if (m % 3 === 0) {
        queries.push(
          `site:reddit.com FP&A software recommendation ${monthName} ${targetYear}`,
          `site:reddit.com EPM Anaplan Planful Pigment ${monthName} ${targetYear}`,
        );
      }
    }
  }

  if (targetCompetitor) {
    const searchAliases = TARGET_COMPETITOR_SEARCH_ALIASES[targetCompetitor] || [targetCompetitor];
    for (const alias of searchAliases) {
      queries.push(
        `site:reddit.com/r/FPandA "${alias}" review`,
        `site:reddit.com/r/FPandA "${alias}" comparison`,
        `site:reddit.com/r/CFO "${alias}" planning software`,
        `site:reddit.com "${alias}" review experience opinion`,
        `site:reddit.com "${alias}" pros cons feedback`,
        `site:reddit.com "switched from" OR "moving from" "${alias}"`,
        `site:reddit.com "${alias}" customer support implementation`,
        `site:reddit.com/r/accounting "${alias}" budgeting forecasting`,
      );
    }
  }

  return queries;
}
