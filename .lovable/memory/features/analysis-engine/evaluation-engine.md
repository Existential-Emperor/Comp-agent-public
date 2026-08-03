---
name: evaluation-engine
description: LLM-as-Judge runs SYNCHRONOUSLY inside the response contract with 2 retries + exponential backoff. Failures are logged to agent_traces.metadata.judge_failure_reason — never silently null.
type: feature
---
LLM-as-Judge evaluates every response against 7 weighted criteria: Factual Correctness (22%), Depth of Comparison (22%), Structural Clarity (13%), Actionability (13%), Citation Coverage (10%), Visual Evidence (10%), Media Quality (10%). Implementation lives in `_shared/judge-helpers.ts` and is invoked SYNCHRONOUSLY by `_shared/response-contract.ts` (`judgeWithRetry`) with up to 2 attempts and 400ms*attempt backoff. On final failure, the reason string is written to `agent_traces.metadata.judge_failure_reason` and `overall_score` stays null — visibility, never silent. Re-runnable via `validate-trace` edge function from /agent-traces.
