// CI gate: post-deploy replay against the live chat-analysis endpoint.
//
// Hits the deployed function with the canonical replay payload that
// previously triggered `ReferenceError: Source is not defined`. Asserts:
//   - the SSE stream completes without a top-level error event
//   - a metadata event arrives with a traceId
//   - the persisted trace has metadata.pipeline.stages populated
//
// Required env:
//   SUPABASE_URL              — project URL
//   SUPABASE_ANON_KEY         — anon key for Authorization header
//   REPLAY_USER_JWT           — a real @workday.com user JWT (chat-analysis
//                               requires an authenticated user). The CI
//                               runner mints this once and stores as a
//                               GitHub secret.
//   SUPABASE_SERVICE_ROLE_KEY — used to read the resulting trace row
//
// Run via: deno run -A supabase/functions/_shared/ci/replay-gate.ts

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const ANON = Deno.env.get("SUPABASE_ANON_KEY");
const USER_JWT = Deno.env.get("REPLAY_USER_JWT");
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !ANON || !USER_JWT || !SERVICE) {
  console.error("replay-gate: missing env (SUPABASE_URL, SUPABASE_ANON_KEY, REPLAY_USER_JWT, SUPABASE_SERVICE_ROLE_KEY)");
  Deno.exit(2);
}

const PAYLOAD = {
  // The canonical failing prompt class — short, deterministic, exercises
  // every pre-stream gather block (competitor resolution, evidence retrieval,
  // media gather, doc retrieval, prompt assembly).
  competitor: "Anaplan",
  message: "Compare workforce planning capabilities with Workday Adaptive Planning.",
  category: "Product",
  subCategory: "Workforce Planning",
  threadId: crypto.randomUUID(),
  messageId: crypto.randomUUID(),
};

console.log("replay-gate: invoking chat-analysis…");
const resp = await fetch(`${SUPABASE_URL}/functions/v1/chat-analysis`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${USER_JWT}`,
    "apikey": ANON,
  },
  body: JSON.stringify(PAYLOAD),
});

if (!resp.ok || !resp.body) {
  console.error(`replay-gate: HTTP ${resp.status} — ${await resp.text()}`);
  Deno.exit(1);
}

let traceId: string | null = null;
let sawError = false;
const reader = resp.body.getReader();
const dec = new TextDecoder();
let buf = "";
const deadline = Date.now() + 180_000;

while (Date.now() < deadline) {
  const { value, done } = await reader.read();
  if (done) break;
  buf += dec.decode(value, { stream: true });
  const events = buf.split("\n\n");
  buf = events.pop() ?? "";
  for (const ev of events) {
    if (ev.startsWith("event: error")) sawError = true;
    const dataLine = ev.split("\n").find((l) => l.startsWith("data: "));
    if (!dataLine) continue;
    try {
      const data = JSON.parse(dataLine.slice(6));
      if (data?.traceId) traceId = data.traceId;
    } catch { /* non-JSON chunks are fine */ }
  }
}

if (sawError) {
  console.error("replay-gate: SSE emitted an error event");
  Deno.exit(1);
}
if (!traceId) {
  console.error("replay-gate: no traceId received from SSE metadata event");
  Deno.exit(1);
}

console.log(`replay-gate: traceId=${traceId} — verifying metadata.pipeline.stages…`);

// Read the persisted trace via PostgREST with the service role.
const traceResp = await fetch(
  `${SUPABASE_URL}/rest/v1/agent_traces?id=eq.${traceId}&select=metadata,status,error_message`,
  { headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` } },
);
const rows = await traceResp.json();
const row = Array.isArray(rows) ? rows[0] : null;
if (!row) {
  console.error("replay-gate: trace row not found");
  Deno.exit(1);
}
const stages = row?.metadata?.pipeline?.stages;
if (!Array.isArray(stages) || stages.length === 0) {
  console.error("replay-gate: metadata.pipeline.stages is empty or missing", row);
  Deno.exit(1);
}
if (row.status !== "completed") {
  console.error(`replay-gate: trace status=${row.status} error=${row.error_message}`);
  Deno.exit(1);
}

console.log(`replay-gate ok: ${stages.length} stages recorded, status=completed`);
Deno.exit(0);
