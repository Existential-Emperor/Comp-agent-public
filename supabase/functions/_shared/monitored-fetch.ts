/**
 * Monitored API Fetch – wraps external API calls with automatic
 * key exhaustion / rate-limit detection and event logging.
 * 
 * Works for ANY API key (Anthropic, Tavily, Lovable, etc.)
 * 
 * Usage:
 *   import { monitoredFetch } from "../_shared/monitored-fetch.ts";
 *   
 *   const res = await monitoredFetch("https://api.anthropic.com/v1/messages", {
 *     method: "POST",
 *     headers: { "x-api-key": ANTHROPIC_API_KEY, ... },
 *     body: JSON.stringify({ ... }),
 *   }, {
 *     keyName: "ANTHROPIC_API_KEY",
 *     service: "anthropic",
 *     edgeFunction: "chat-analysis",
 *   });
 */

import { logKeyEvent, isKeyExhaustedResponse, eventTypeFromStatus } from "./api-key-monitor.ts";

interface MonitorContext {
  keyName: string;
  service: string;
  edgeFunction?: string;
}

/**
 * Wrapper around fetch() that monitors for API key issues.
 * Logs events when 401/402/403/429 responses are detected.
 * Returns the original response unchanged.
 */
export async function monitoredFetch(
  url: string,
  init: RequestInit,
  ctx: MonitorContext,
): Promise<Response> {
  const response = await fetch(url, init);

  if (isKeyExhaustedResponse(response.status)) {
    const eventType = eventTypeFromStatus(response.status);
    
    // Clone the response to read the error body without consuming it
    const cloned = response.clone();
    let errorMessage: string | undefined;
    try {
      const body = await cloned.text();
      errorMessage = body.slice(0, 500);
    } catch {
      // ignore
    }

    logKeyEvent({
      keyName: ctx.keyName,
      service: ctx.service,
      eventType,
      httpStatus: response.status,
      errorMessage,
      edgeFunction: ctx.edgeFunction,
    }).catch(() => {}); // fire-and-forget
  }

  return response;
}
