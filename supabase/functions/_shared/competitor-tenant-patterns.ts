// Shared competitor URL-pattern config + slug helpers for the Customer_exists job.
//
// Each enumerable competitor exposes per-customer tenants as subdomains under a
// known root. We learn the *observed* tenant slugs from public certificate
// transparency logs (crt.sh) — only the 6 public root domains below are ever
// sent externally; customer data is matched locally.

export interface CompetitorPattern {
  /** Canonical display name used in matched_competitors + UI badges. */
  name: string;
  /** Root domain queried at crt.sh as `%.<root>`. */
  root: string;
  /**
   * Given a full observed hostname from CT logs, return the bare account slug,
   * or null if the hostname does not match this competitor's tenant shape.
   */
  extractSlug: (hostname: string) => string | null;
}

// Non-production / environment tokens that decorate a bare account slug.
const ENV_PREFIXES = ["live-", "trial-", "sandbox-", "demo-", "test-", "uat-", "poc-", "dev-", "stg-", "stage-"];
const ENV_SUFFIXES = ["-prod", "-production", "-test", "-uat", "-poc", "-demo", "-dev", "-stg", "-stage", "-sandbox", "-trial", "-live"];

/** Strip env affixes from a single subdomain label to get the bare slug. */
function stripEnvAffixes(label: string): string {
  let s = label.toLowerCase();
  for (const p of ENV_PREFIXES) {
    if (s.startsWith(p)) { s = s.slice(p.length); break; }
  }
  for (const suf of ENV_SUFFIXES) {
    if (s.endsWith(suf)) { s = s.slice(0, -suf.length); break; }
  }
  return s;
}

/** Normalize a hostname: lowercase, strip wildcard + trailing dot. */
function normHost(h: string): string {
  return h.trim().toLowerCase().replace(/^\*\./, "").replace(/\.$/, "");
}

/** Returns the leftmost label if `host` ends with `.<suffix>`, else null. */
function leftmostLabelFor(host: string, suffix: string): string | null {
  if (host === suffix || !host.endsWith("." + suffix)) return null;
  const prefix = host.slice(0, host.length - suffix.length - 1);
  if (!prefix || prefix.includes(".")) return null; // single label only
  return prefix;
}

export const COMPETITOR_PATTERNS: CompetitorPattern[] = [
  {
    // https://<slug>-idp.board.com/Account/Login
    name: "Board",
    root: "board.com",
    extractSlug: (host) => {
      const h = normHost(host);
      const label = leftmostLabelFor(h, "board.com");
      if (!label || !label.endsWith("-idp")) return null;
      const slug = stripEnvAffixes(label.slice(0, -"-idp".length));
      return slug || null;
    },
  },
  {
    // https://<slug>-prod.saastagetik.com/prod/
    name: "CCH Tagetik",
    root: "saastagetik.com",
    extractSlug: (host) => {
      const h = normHost(host);
      const label = leftmostLabelFor(h, "saastagetik.com");
      if (!label) return null;
      const slug = stripEnvAffixes(label);
      return slug || null;
    },
  },
  {
    // https://live-<slug>.cloud.jedox.com/ui/login/
    name: "Jedox",
    root: "cloud.jedox.com",
    extractSlug: (host) => {
      const h = normHost(host);
      const label = leftmostLabelFor(h, "cloud.jedox.com");
      if (!label) return null;
      const slug = stripEnvAffixes(label);
      return slug || null;
    },
  },
  {
    // https://<slug>.onestreamcloud.com
    name: "OneStream",
    root: "onestreamcloud.com",
    extractSlug: (host) => {
      const h = normHost(host);
      const label = leftmostLabelFor(h, "onestreamcloud.com");
      if (!label) return null;
      const slug = stripEnvAffixes(label);
      return slug || null;
    },
  },
  {
    // https://<slug>.planful.com
    name: "Planful",
    root: "planful.com",
    extractSlug: (host) => {
      const h = normHost(host);
      const label = leftmostLabelFor(h, "planful.com");
      if (!label || label === "www") return null;
      const slug = stripEnvAffixes(label);
      return slug || null;
    },
  },
  {
    // https://<slug>.vena.io
    name: "Vena",
    root: "vena.io",
    extractSlug: (host) => {
      const h = normHost(host);
      const label = leftmostLabelFor(h, "vena.io");
      if (!label || label === "www") return null;
      const slug = stripEnvAffixes(label);
      return slug || null;
    },
  },
];

// Reserved/infra labels that are never customer tenants. Keeps the index clean.
const RESERVED_SLUGS = new Set([
  "www", "mail", "smtp", "imap", "pop", "ns", "ns1", "ns2", "mx", "cdn",
  "api", "app", "apps", "login", "auth", "sso", "idp", "portal", "admin",
  "static", "assets", "media", "img", "images", "files", "download",
  "status", "support", "help", "docs", "blog", "news", "info", "test",
  "staging", "dev", "demo", "preview", "internal", "vpn", "remote",
  "autodiscover", "lyncdiscover", "sip", "_dmarc", "_domainkey",
]);

export function isReservedSlug(slug: string): boolean {
  if (!slug || slug.length < 2) return true;
  if (RESERVED_SLUGS.has(slug)) return true;
  if (slug.startsWith("_")) return true;
  return false;
}

/** Extract the second-level domain label from a URL or bare hostname. */
function sldFromHost(raw: string): string | null {
  let host = raw.trim().toLowerCase();
  host = host.replace(/^[a-z]+:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "");
  const labels = host.split(".").filter(Boolean);
  if (labels.length >= 2) {
    // second-level label (e.g. vailresorts.com -> vailresorts; foo.co.uk -> foo)
    return labels.length >= 3 && ["co", "com", "org", "net", "gov", "ac"].includes(labels[labels.length - 2])
      ? labels[labels.length - 3]
      : labels[labels.length - 2];
  }
  if (labels.length === 1) return labels[0];
  return null;
}

/**
 * Derive candidate tenant slugs for a customer from its primary URL, any
 * alternate "valid" domains, and the company name ("Both + variants"). All
 * matching is local — these never leave the system.
 */
export function deriveCandidateSlugs(
  name: string | null,
  url: string | null,
  validDomains: string[] | null = null,
): string[] {
  const out = new Set<string>();

  const add = (s: string | undefined | null) => {
    if (!s) return;
    const v = s.toLowerCase().replace(/[^a-z0-9-]/g, "");
    if (v.length >= 2) out.add(v);
  };

  // --- From primary URL + alternate valid domains: second-level domain label ---
  const hosts = [url, ...(validDomains ?? [])].filter((h): h is string => !!h && !!h.trim());
  for (const h of hosts) add(sldFromHost(h));

  // --- From company name ---
  if (name) {
    const cleanedWords = name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, " ")
      .split(/[\s-]+/)
      .filter(Boolean)
      .filter((w) => !["inc", "incorporated", "corp", "corporation", "llc", "ltd", "limited", "co", "company", "group", "holdings", "plc", "gmbh", "the", "and"].includes(w));

    if (cleanedWords.length) {
      add(cleanedWords.join(""));        // vailresorts
      add(cleanedWords.join("-"));       // vail-resorts
      add(cleanedWords[0]);              // vail
      if (cleanedWords.length >= 2) {
        add(cleanedWords.map((w) => w[0]).join("")); // acronym: vr
      }
    }
  }

  return [...out].filter((s) => !isReservedSlug(s));
}
