CREATE OR REPLACE FUNCTION public.acquire_match_lease(_lease_minutes integer DEFAULT 3)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n integer;
BEGIN
  UPDATE public.matcher_state
    SET running_since = now(), updated_at = now()
    WHERE id = 1
      AND (running_since IS NULL OR running_since < now() - make_interval(mins => _lease_minutes));
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n > 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_match_lease()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.matcher_state SET running_since = NULL, updated_at = now() WHERE id = 1;
$$;

REVOKE ALL ON FUNCTION public.acquire_match_lease(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_match_lease() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.acquire_match_lease(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_match_lease() TO service_role;