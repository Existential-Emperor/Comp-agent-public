-- Restrict the FTS RPC to service_role only (backend edge functions).
-- The Comp Agent uses the service-role client; the browser never calls it.
revoke execute on function public.search_adaptive_kb(text, int) from authenticated, anon, public;
grant  execute on function public.search_adaptive_kb(text, int) to service_role;

-- Also restrict direct table SELECT to service_role only.
-- This prevents the raw KB content from being exposed via the public REST API,
-- per the project rule: adaptive planning data must not leak to external APIs / clients.
drop policy if exists "Authenticated read adaptive_planning_kb" on public.adaptive_planning_kb;
create policy "Service role read adaptive_planning_kb"
  on public.adaptive_planning_kb for select
  to service_role using (true);