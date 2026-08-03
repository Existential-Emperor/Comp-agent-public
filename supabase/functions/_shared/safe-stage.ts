// Strict safeStage boundary for non-critical pipeline subsystems.
//
// Contract:
// - Every call site MUST declare a typed inert fallback. The fallback is the
//   value the rest of the pipeline sees if the stage throws or times out.
// - Inert means: empty arrays, nulls, neutral defaults — never a "best guess"
//   that looks like real data.
// - Soft failures are recorded in the returned StageDiagnostics so the
//   orchestrator can surface a degraded-output signal to the client.

import type { StageDiagnostics } from "./pipeline-types.ts";

export interface SafeStageOptions {
  /** Hard upper bound in ms. Required so a stuck stage cannot wedge the request. */
  timeoutMs: number;
  /** Optional notes recorded in diagnostics regardless of outcome. */
  notes?: Record<string, unknown>;
}

export interface SafeStageResult<T> {
  value: T;
  diagnostics: StageDiagnostics;
  /** True when the stage threw, timed out, or otherwise produced the fallback. */
  degraded: boolean;
}

export async function safeStage<T>(
  name: string,
  fn: () => Promise<T>,
  fallback: T,
  opts: SafeStageOptions,
): Promise<SafeStageResult<T>> {
  const started = Date.now();
  let timer: number | undefined;
  try {
    const result = await Promise.race<T>([
      fn(),
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`safeStage(${name}) timeout after ${opts.timeoutMs}ms`)),
          opts.timeoutMs,
        ) as unknown as number;
      }),
    ]);
    return {
      value: result,
      degraded: false,
      diagnostics: {
        name,
        status: "ok",
        ms: Date.now() - started,
        notes: opts.notes,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[safeStage:${name}] failed_soft:`, message);
    return {
      value: fallback,
      degraded: true,
      diagnostics: {
        name,
        status: "failed_soft",
        ms: Date.now() - started,
        error: message.slice(0, 400),
        notes: opts.notes,
      },
    };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/** Convenience to record a stage that was deliberately not run. */
export function skippedStage(name: string, reason: string): StageDiagnostics {
  return { name, status: "skipped", ms: 0, notes: { reason } };
}
