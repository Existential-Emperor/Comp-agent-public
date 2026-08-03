-- Set-based bulk write for customer match results (replaces per-row UPDATE fan-out).
CREATE OR REPLACE FUNCTION public.apply_customer_matches(_rows jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected integer;
BEGIN
  UPDATE public.customers c
  SET match_status        = r.match_status,
      matched_competitors = COALESCE(r.matched_competitors, '{}'::text[]),
      match_details       = r.match_details,
      last_checked_at      = now()
  FROM jsonb_to_recordset(_rows) AS r(
    id uuid,
    match_status text,
    matched_competitors text[],
    match_details jsonb
  )
  WHERE c.id = r.id;

  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_customer_matches(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_customer_matches(jsonb) TO service_role;

-- Cross-invocation concurrency guard for the matcher worker.
-- A constant advisory lock key so overlapping cron ticks don't stampede.
CREATE OR REPLACE FUNCTION public.try_match_lock()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pg_try_advisory_lock(913572468123001);
$$;

CREATE OR REPLACE FUNCTION public.release_match_lock()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pg_advisory_unlock(913572468123001);
$$;

REVOKE ALL ON FUNCTION public.try_match_lock() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_match_lock() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.try_match_lock() TO service_role;
GRANT EXECUTE ON FUNCTION public.release_match_lock() TO service_role;