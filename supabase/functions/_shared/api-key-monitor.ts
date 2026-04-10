/**
 * API Key Monitor – logs exhaustion/rate-limit events and triggers email alerts.
 * 
 * Usage:
 *   import { logKeyEvent } from "../_shared/api-key-monitor.ts";
 *   
 *   // When a 402 / 429 / auth error is detected:
 *   await logKeyEvent({
 *     keyName: "FIRECRAWL_API_KEY_2",
 *     service: "firecrawl",
 *     eventType: "credits_exhausted",
 *     httpStatus: 402,
 *     edgeFunction: "crawl-competitor-pages",
 *   });
 */

import { createClient } from "jsr:@supabase/supabase-js@2";

interface KeyEventInput {
  keyName: string;
  service: string;
  eventType?: "credits_exhausted" | "rate_limited" | "auth_error" | "unknown_error";
  httpStatus?: number;
  errorMessage?: string;
  edgeFunction?: string;
  metadata?: Record<string, unknown>;
}

// Dedup window: don't log the same key+event more than once per hour
const recentEvents = new Map<string, number>();
const DEDUP_WINDOW_MS = 60 * 60 * 1000; // 1 hour

/**
 * Log an API key event to the database and trigger an email notification.
 * Deduplicates events within a 1-hour window per key+eventType.
 */
export async function logKeyEvent(input: KeyEventInput): Promise<void> {
  const {
    keyName,
    service,
    eventType = "credits_exhausted",
    httpStatus,
    errorMessage,
    edgeFunction,
    metadata = {},
  } = input;

  // In-memory dedup for the current function invocation
  const dedupKey = `${keyName}:${eventType}`;
  const lastLogged = recentEvents.get(dedupKey);
  if (lastLogged && Date.now() - lastLogged < DEDUP_WINDOW_MS) {
    console.log(`[api-key-monitor] Skipping duplicate event for ${keyName} (${eventType})`);
    return;
  }
  recentEvents.set(dedupKey, Date.now());

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("[api-key-monitor] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY — cannot log event");
    return;
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    // Check DB-level dedup: don't insert if same key+event logged in last hour
    const oneHourAgo = new Date(Date.now() - DEDUP_WINDOW_MS).toISOString();
    const { data: existing } = await supabase
      .from("api_key_events")
      .select("id")
      .eq("key_name", keyName)
      .eq("event_type", eventType)
      .gte("created_at", oneHourAgo)
      .limit(1);

    if (existing && existing.length > 0) {
      console.log(`[api-key-monitor] DB dedup: ${keyName} (${eventType}) already logged within 1h`);
      return;
    }

    // Insert event
    const { error: insertError } = await supabase
      .from("api_key_events")
      .insert({
        key_name: keyName,
        service,
        event_type: eventType,
        http_status: httpStatus,
        error_message: errorMessage,
        edge_function: edgeFunction,
        metadata,
        notified: false,
      });

    if (insertError) {
      console.error("[api-key-monitor] Failed to insert event:", insertError.message);
      return;
    }

    console.log(`[api-key-monitor] ⚠️ Logged ${eventType} for ${keyName} (${service}) from ${edgeFunction || "unknown"}`);

    // Fire-and-forget: trigger email notification
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";
    fetch(`${SUPABASE_URL}/functions/v1/notify-key-exhaustion`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        keyName,
        service,
        eventType,
        httpStatus,
        errorMessage,
        edgeFunction,
      }),
    }).catch(err => {
      console.error("[api-key-monitor] Failed to trigger notification:", err);
    });
  } catch (err) {
    console.error("[api-key-monitor] Error logging event:", err);
  }
}

/**
 * Utility to detect and log API key issues from any HTTP response.
 * Call this after any external API call to automatically detect credit/rate issues.
 * 
 * Returns true if the response indicates a key issue (caller should handle fallback).
 */
export function isKeyExhaustedResponse(status: number): boolean {
  return status === 402 || status === 429 || status === 401 || status === 403;
}

/**
 * Detect the event type from an HTTP status code.
 */
export function eventTypeFromStatus(status: number): KeyEventInput["eventType"] {
  switch (status) {
    case 402: return "credits_exhausted";
    case 429: return "rate_limited";
    case 401:
    case 403: return "auth_error";
    default: return "unknown_error";
  }
}
