/**
 * Firecrawl API Key Queue
 * 
 * Manages multiple Firecrawl API keys with automatic failover on 402 (credits exhausted).
 * Keys are loaded from environment variables: FIRECRAWL_API_KEY_1, FIRECRAWL_API_KEY_2.
 * 
 * Usage:
 *   import { firecrawlFetch, getActiveFirecrawlKey } from "../_shared/firecrawl-keys.ts";
 *   
 *   // Option A: Use firecrawlFetch (recommended) — auto-retries on 402
 *   const res = await firecrawlFetch("https://api.firecrawl.dev/v1/scrape", { method: "POST", ... });
 *   
 *   // Option B: Get the current active key
 *   const key = getActiveFirecrawlKey();
 */

import { logKeyEvent } from "./api-key-monitor.ts";

// Ordered list of env var names for Firecrawl keys
const KEY_ENV_NAMES = [
  "FIRECRAWL_API_KEY_1",
  "FIRECRAWL_API_KEY_2",
  "FIRECRAWL_API_KEY_3",
  "FIRECRAWL_API_KEY_4",
];

// Track which keys are exhausted (402'd) during this function invocation
const exhaustedKeys = new Set<string>();

/**
 * Get all available Firecrawl API keys from environment, excluding exhausted ones.
 */
function getAvailableKeys(): { envName: string; key: string }[] {
  const keys: { envName: string; key: string }[] = [];
  for (const envName of KEY_ENV_NAMES) {
    if (exhaustedKeys.has(envName)) continue;
    const key = Deno.env.get(envName);
    if (key && key.trim()) {
      keys.push({ envName, key: key.trim() });
    }
  }
  return keys;
}

/**
 * Get the first available (non-exhausted) Firecrawl API key.
 * Returns null if all keys are exhausted or none are configured.
 */
export function getActiveFirecrawlKey(): string | null {
  const keys = getAvailableKeys();
  return keys.length > 0 ? keys[0].key : null;
}

/**
 * Check if any Firecrawl key is configured at all.
 */
export function hasFirecrawlKey(): boolean {
  for (const envName of KEY_ENV_NAMES) {
    const key = Deno.env.get(envName);
    if (key && key.trim()) return true;
  }
  return false;
}

/**
 * Mark a key as exhausted (called internally on 402 responses).
 */
function markKeyExhausted(envName: string, callerFunction?: string): void {
  exhaustedKeys.add(envName);
  const remaining = getAvailableKeys().length;
  console.log(`[firecrawl-keys] Key ${envName} exhausted (402). ${remaining} keys remaining.`);
  
  // Log event and trigger email notification
  logKeyEvent({
    keyName: envName,
    service: "firecrawl",
    eventType: "credits_exhausted",
    httpStatus: 402,
    edgeFunction: callerFunction,
    metadata: { remaining_keys: remaining },
  }).catch(() => {}); // fire-and-forget
}

/**
 * Wrapper around fetch() for Firecrawl API calls.
 * Automatically injects the Authorization header and retries with the next key on 402.
 * Logs exhaustion events and triggers email alerts.
 * 
 * @param url - The Firecrawl API URL (e.g., "https://api.firecrawl.dev/v1/scrape")
 * @param init - Standard fetch RequestInit, but Authorization header will be overridden
 * @param callerFunction - Optional: name of the calling edge function (for logging)
 * @returns The fetch Response from a successful (non-402) attempt, or the last 402 response if all keys are exhausted
 */
export async function firecrawlFetch(
  url: string,
  init?: RequestInit,
  callerFunction?: string,
): Promise<Response> {
  const keys = getAvailableKeys();
  
  if (keys.length === 0) {
    // Log that we have zero keys available
    logKeyEvent({
      keyName: "ALL_FIRECRAWL_KEYS",
      service: "firecrawl",
      eventType: "credits_exhausted",
      errorMessage: "No Firecrawl API keys available — all exhausted or none configured",
      edgeFunction: callerFunction,
    }).catch(() => {});

    return new Response(
      JSON.stringify({ success: false, error: "No Firecrawl API keys available — all exhausted or none configured" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  let lastResponse: Response | null = null;

  for (const { envName, key } of keys) {
    const headers = new Headers(init?.headers);
    headers.set("Authorization", `Bearer ${key}`);
    headers.set("Content-Type", "application/json");

    const response = await fetch(url, {
      ...init,
      headers,
    });

    if (response.status === 402) {
      // Credits exhausted — mark this key, log event, and try next
      markKeyExhausted(envName, callerFunction);
      lastResponse = response;
      await response.text(); // consume body
      continue;
    }

    // Also monitor rate limits (429)
    if (response.status === 429) {
      logKeyEvent({
        keyName: envName,
        service: "firecrawl",
        eventType: "rate_limited",
        httpStatus: 429,
        edgeFunction: callerFunction,
      }).catch(() => {});
    }

    return response;
  }

  // All keys exhausted
  console.error("[firecrawl-keys] All Firecrawl API keys exhausted (402). No credits remaining on any key.");
  
  logKeyEvent({
    keyName: "ALL_FIRECRAWL_KEYS",
    service: "firecrawl",
    eventType: "credits_exhausted",
    httpStatus: 402,
    errorMessage: "All Firecrawl API keys exhausted — no credits remaining on any key",
    edgeFunction: callerFunction,
  }).catch(() => {});

  return lastResponse || new Response(
    JSON.stringify({ success: false, error: "All Firecrawl API keys exhausted" }),
    { status: 402, headers: { "Content-Type": "application/json" } },
  );
}
