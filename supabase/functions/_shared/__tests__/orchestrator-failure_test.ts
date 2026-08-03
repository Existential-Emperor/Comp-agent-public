// Regression test for the failure-class definition of done:
//
//   "If a non-critical helper throws (including a ReferenceError that would
//    otherwise look like a deploy bug), the orchestrator must surface a
//    structured failed_soft diagnostic and the request must continue with
//    the typed inert fallback."
//
// We exercise the actual primitives the chat-analysis orchestrator uses
// (safeStage + runStage) rather than mocking them, so a future refactor
// that bypasses them is caught.

import { assertEquals, assert } from "jsr:@std/assert@1.0.0";
import { safeStage } from "../safe-stage.ts";
import { runStage, defineStage } from "../orchestrator-stage.ts";
import type { StageDiagnostics } from "../pipeline-types.ts";

Deno.test("safeStage converts a ReferenceError throw into failed_soft with inert fallback", async () => {
  const fallback = { context: "", chunks: [] as string[] };
  const result = await safeStage(
    "doc_retrieval.simulated",
    async () => {
      // Mimic the original incident shape: a bare identifier reference.
      // deno-lint-ignore no-explicit-any
      return (globalThis as any).__definitely_not_defined.value;
    },
    fallback,
    { timeoutMs: 1000 },
  );
  assertEquals(result.degraded, true);
  assertEquals(result.value, fallback);
  assertEquals(result.diagnostics.status, "failed_soft");
  assert(result.diagnostics.error && result.diagnostics.error.length > 0);
});

Deno.test("safeStage records ok when stage returns normally", async () => {
  const result = await safeStage(
    "stage.ok",
    async () => ({ chunks: ["a", "b"] }),
    { chunks: [] },
    { timeoutMs: 1000 },
  );
  assertEquals(result.degraded, false);
  assertEquals(result.value.chunks.length, 2);
  assertEquals(result.diagnostics.status, "ok");
});

Deno.test("safeStage enforces timeout and fails soft", async () => {
  let pendingTimer: number | undefined;
  const result = await safeStage(
    "stage.slow",
    () => new Promise<string>((res) => {
      pendingTimer = setTimeout(() => res("late"), 200) as unknown as number;
    }),
    "fallback",
    { timeoutMs: 25 },
  );
  if (pendingTimer !== undefined) clearTimeout(pendingTimer);
  assertEquals(result.degraded, true);
  assertEquals(result.value, "fallback");
  assertEquals(result.diagnostics.status, "failed_soft");
  assert((result.diagnostics.error ?? "").includes("timeout"));
});

Deno.test("runStage(soft) routes through safeStage and pushes diagnostics", async () => {
  const diag: StageDiagnostics[] = [];
  const stage = defineStage<number>({
    name: "soft.example",
    critical: false,
    fallback: -1,
    timeoutMs: 100,
    run: async () => {
      throw new Error("boom");
    },
  });
  const { value, degraded } = await runStage(stage, diag);
  assertEquals(value, -1);
  assertEquals(degraded, true);
  assertEquals(diag.length, 1);
  assertEquals(diag[0].status, "failed_soft");
  assertEquals(diag[0].name, "soft.example");
});

Deno.test("runStage(critical) propagates the throw and records failed_hard", async () => {
  const diag: StageDiagnostics[] = [];
  const stage = defineStage<string>({
    name: "critical.example",
    critical: true,
    timeoutMs: 100,
    run: async () => {
      throw new Error("hard fail");
    },
  });
  let caught: unknown;
  try {
    await runStage(stage, diag);
  } catch (e) {
    caught = e;
  }
  assert(caught instanceof Error);
  assertEquals((caught as Error).message, "hard fail");
  assertEquals(diag.length, 1);
  assertEquals(diag[0].status, "failed_hard");
});

Deno.test("runStage(critical) honors timeout", async () => {
  const diag: StageDiagnostics[] = [];
  let pendingTimer: number | undefined;
  const stage = defineStage<string>({
    name: "critical.slow",
    critical: true,
    timeoutMs: 25,
    run: () => new Promise<string>((res) => {
      pendingTimer = setTimeout(() => res("late"), 200) as unknown as number;
    }),
  });
  let caught: unknown;
  try {
    await runStage(stage, diag);
  } catch (e) {
    caught = e;
  }
  if (pendingTimer !== undefined) clearTimeout(pendingTimer);
  assert(caught instanceof Error);
  assert((caught as Error).message.includes("timeout"));
  assertEquals(diag[0].status, "failed_hard");
});
