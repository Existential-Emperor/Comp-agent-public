-- The advisory-lock approach can't survive PostgREST transaction pooling
-- (a session lock taken in one RPC call isn't reliably held/released across
-- the next call). Replace with a single-row lease that's enforced atomically
-- in one UPDATE statement.
DROP FUNCTION IF EXISTS public.try_match_lock();
DROP FUNCTION IF EXISTS public.release_match_lock();

CREATE TABLE public.matcher_state (
  id integer PRIMARY KEY,
  running_since timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.matcher_state TO service_role;

ALTER TABLE public.matcher_state ENABLE ROW LEVEL SECURITY;
-- No policies: only the service role (which bypasses RLS) touches this table.

INSERT INTO public.matcher_state (id, running_since) VALUES (1, NULL)
ON CONFLICT (id) DO NOTHING;