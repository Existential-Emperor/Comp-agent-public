// Type-level enforcement for orchestrator stages.
//
// Goal: make "I forgot to wrap a non-critical stage in safeStage" a compile
// error, not a code-review oversight. Every async unit of work registered
// with the orchestrator must declare ONE of:
//
//   - critical: true  — fail-hard. No fallback. Must be allow-listed
//                       (auth, request validation, prompt assembly,
//                       primary LLM generation, trace persistence).
//   - critical: false — must provide a typed inert `fallback: T`. The
//                       orchestrator routes execution through safeStage
//                       so any throw becomes a failed_soft diagnostic.
//
// Raw `() => Promise<T>` is intentionally NOT assignable to OrchestratorStage.
// That is the whole point: a developer cannot register an unwrapped stage.

import { safeStage, type SafeStageResult } from "./safe-stage.ts";
import type { StageDiagnostics } from "./pipeline-types.ts";

export interface CriticalStage<T> {
  name: string;
  critical: true;
  /** Fail-hard. The orchestrator lets this throw propagate. */
  run: () => Promise<T>;
  /** Hard upper bound. Even critical stages must declare a timeout. */
  timeoutMs: number;
}

export interface SoftStage<T> {
  name: string;
  critical: false;
  /** May throw or time out. Result is replaced with `fallback`. */
  run: () => Promise<T>;
  /** Inert default surfaced when the stage degrades. Required by type. */
  fallback: T;
  timeoutMs: number;
  notes?: Record<string, unknown>;
}

export type OrchestratorStage<T> = CriticalStage<T> | SoftStage<T>;

/**
 * Run a stage according to its declared criticality. Soft stages route
 * through safeStage; critical stages run with a timeout but no fallback.
 *
 * Diagnostics are pushed onto `into` (the shared stageDiagnostics array
 * used by the chat-analysis orchestrator).
 */
export async function runStage<T>(
  stage: OrchestratorStage<T>,
  into: StageDiagnostics[],
): Promise<{ value: T; degraded: boolean }> {
  if (stage.critical) {
    const started = Date.now();
    let timer: number | undefined;
    try {
      const value = await Promise.race<T>([
        stage.run(),
        new Promise<T>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error(`critical stage ${stage.name} timeout after ${stage.timeoutMs}ms`)),
            stage.timeoutMs,
          ) as unknown as number;
        }),
      ]);
      into.push({ name: stage.name, status: "ok", ms: Date.now() - started });
      return { value, degraded: false };
    } catch (err) {
      into.push({
        name: stage.name,
        status: "failed_hard",
        ms: Date.now() - started,
        error: (err instanceof Error ? err.message : String(err)).slice(0, 400),
      });
      throw err;
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  const result: SafeStageResult<T> = await safeStage(
    stage.name,
    stage.run,
    stage.fallback,
    { timeoutMs: stage.timeoutMs, notes: stage.notes },
  );
  into.push(result.diagnostics);
  return { value: result.value, degraded: result.degraded };
}

/**
 * Compile-time guard: forces a value to be a valid OrchestratorStage.
 * Use this at registration sites so a bare `async () => …` is rejected
 * by the type checker rather than silently accepted.
 */
export function defineStage<T>(stage: OrchestratorStage<T>): OrchestratorStage<T> {
  return stage;
}
