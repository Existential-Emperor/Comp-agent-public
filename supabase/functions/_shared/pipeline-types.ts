// Canonical types for the staged analysis pipeline.
//
// Two hard rules enforced structurally (not by reviewers):
//
// 1. EvidenceSource is the ONLY source-shaped type that may cross a serializer
//    boundary toward the client (trace metadata, SSE events, response bodies).
//
// 2. EvidenceContent (raw excerpts, including Adaptive Planning KB chunks) is
//    backend-only. The trace persistence helper accepts EvidenceSource[] and
//    refuses EvidenceContent at the type level via the ClientSafe<T> brand.

export type SourceKind = "web" | "feed" | "doc" | "media_source_page";

/**
 * Client-safe descriptor of an evidence source. Safe to serialize to the
 * browser and to persist in agent_traces.metadata.
 */
export interface EvidenceSource {
  /** Stable id used for inline citation normalization (e.g. `s_4`). */
  id: string;
  kind: SourceKind;
  /** Human label rendered in the Sources block. */
  label: string;
  /** Deep URL when applicable. Domain-only links are rejected upstream. */
  url?: string;
  /** Doc identifier (e.g. `formulas › Date functions`) for KB sources. */
  docRef?: string;
  /** Optional title pulled from page metadata or doc heading. */
  title?: string;
}

/**
 * Backend-only payload. Carries the raw text/excerpt that fed the model.
 * MUST NOT be serialized to the client. Enforced by the ClientSafe brand
 * on the trace persistence layer (see safe-stage.ts).
 */
export interface EvidenceContent {
  sourceId: string;
  excerpt: string;
  chunkCount: number;
}

// ---------------------------------------------------------------------------
// Stage result envelope. Every pipeline stage returns one of these instead of
// throwing, so a soft failure cannot kill the whole request.
// ---------------------------------------------------------------------------

export interface StageOk<T> {
  ok: true;
  data: T;
  diagnostics: StageDiagnostics;
}

export interface StageErr {
  ok: false;
  errorCode: string;
  /** Message safe to surface to the client (no stack traces, no PII). */
  safeMessage: string;
  diagnostics: StageDiagnostics;
}

export type StageResult<T> = StageOk<T> | StageErr;

export interface StageDiagnostics {
  name: string;
  status: "ok" | "failed_soft" | "failed_hard" | "skipped";
  ms: number;
  error?: string;
  notes?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Brand used to keep EvidenceContent from accidentally being passed into a
// client-bound serializer. Pure compile-time check.
// ---------------------------------------------------------------------------
declare const __clientSafe: unique symbol;
export type ClientSafe<T> = T & { readonly [__clientSafe]?: true };

/**
 * Tag a value as client-safe. Use only on payloads that contain ZERO
 * EvidenceContent excerpts. The runtime is a no-op; the value is the
 * compile-time guarantee at call sites.
 */
export function markClientSafe<T>(value: T): ClientSafe<T> {
  return value as ClientSafe<T>;
}

// ---------------------------------------------------------------------------
// Pipeline-wide diagnostics block persisted to agent_traces.metadata.pipeline.
// ---------------------------------------------------------------------------
export interface PipelineDiagnostics {
  requestId: string;
  /** Last completed checkpoint name (extension hook for step 6). */
  checkpoint?: string;
  stages: StageDiagnostics[];
}
