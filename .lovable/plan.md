## Goal

77,683 customers are stuck in `pending` because the matcher ran as one long self-chaining loop: a CPU-kill terminated the isolate before it could re-invoke itself, so the chain died permanently. Fix the architecture, not the symptom — make each invocation a bounded, independent worker driven by an external cron tick, so any process that dies is simply replaced by the next tick continuing the remaining work.

## #1 — Loop → durable queue (the architectural fix)

Each invocation becomes a **single bounded chunk worker**, not a loop:

- Remove the `while (Date.now() - startedAt < TIME_BUDGET_MS)` drain loop. One invocation claims **one chunk** of pending rows (e.g. 2,000), matches them, writes results, and returns.
- A `pg_cron` job ticks **every minute**, calling `Customer_exists` via `net.http_post` with the existing `x-cron-secret` header (same pattern as `fetch-news`/`ambient-crawler`). Each tick is an independent process.
- Resumability is automatic: matching only reads `match_status='pending'` and flips rows out of that pool. If a tick CPU-exhausts mid-chunk, the rows already written are done; the rest stay `pending` and the next tick picks them up. No state to repair.
- Per-tick throughput fix (root cause of the CPU exhaustion): replace the 1,000 per-row `UPDATE` round-trips with **one set-based write per chunk** via a new `SECURITY DEFINER` RPC `apply_customer_matches(_rows jsonb)` doing `UPDATE customers ... FROM jsonb_to_recordset(...)`. This is threading existing data through one existing code path, not new infrastructure — and it makes each bounded tick actually finish inside budget.

## #2 — Delete the self-invoke continuation

With the cron tick as the continuation, the self-chaining apparatus is removed entirely:

- Delete `selfInvoke`, `hop`, `MAX_HOPS`, and the chained `refresh_index → match` handoff.
- Index refresh folds into the same cadence: each tick first advances **one** stale root (via `staleRoots()`) if any exists, otherwise matches one chunk. All 6 roots are currently populated, so this is normally a no-op — but it keeps a single durable driver for both phases with no self-invocation.
- **Concurrency guard** (the only surviving piece of #2's territory): wrap the worker body in a Postgres advisory lock via a `try_match_lock()` RPC (`pg_try_advisory_lock`). An overlapping tick that can't get the lock returns immediately, preventing two ticks from re-pulling the same pending rows or stampeding CPU.

## UI (`src/pages/Customers.tsx`)

- `runMatching` keeps the "Run matching" button as a manual **kick** — one immediate worker tick (`action: "match"`) — then shows `processed` / `remaining`, with the existing "continuing in background" messaging now backed by the real cron driver.
- The `reset` path (re-match everything) stays: it flips all rows back to `pending`; the cron drains them.

## Technical details

Files / objects touched:

```text
supabase/functions/Customer_exists/index.ts   rewrite handler: bounded single-chunk worker,
                                              remove selfInvoke/hop/MAX_HOPS/while-loop,
                                              call apply_customer_matches + try_match_lock
migration                                     create apply_customer_matches(jsonb) RPC
                                              create try_match_lock()/unlock RPC (advisory lock)
cron (via insert tool, not migration)         schedule Customer_exists every minute with
                                              x-cron-secret (contains anon key — insert, not migrate)
src/pages/Customers.tsx                        runMatching → single-tick kick + progress toast
```

Notes:
- Cron scheduling uses the `insert` tool (not a migration) because the command embeds the project anon key, matching the existing job rows.
- RPCs are `SECURITY DEFINER` with `search_path = public`, granted to `service_role` (and the worker calls them with the service client). No anon exposure.
- No adaptive-planning or customer data leaves the system; only the 6 public competitor roots are ever sent externally (unchanged).
- Chunk size and cron interval are tunable; starting point 2,000 rows/tick @ 1 min drains ~78k in well under two hours, self-healing across any CPU kills.

## Verification

- After deploy + schedule: watch `match_status` counts fall (`pending` → `matched`/`unmatched`) across successive minutes via read queries.
- Confirm a CPU-killed tick no longer stalls the pipeline (counts keep moving on the next tick).
- Confirm overlapping ticks no-op cleanly (advisory lock) in edge logs.
