-- =============================================================
-- Restore pg_cron -> edge function auth after security hardening
-- The cron jobs authenticated with the public anon key, which the new
-- in-code requireAuth guard correctly rejects. Give cron a non-public
-- credential it CAN present: a Vault-stored shared secret sent via header.
-- =============================================================

-- 1) Encrypted shared secret for scheduled callers
SELECT vault.create_secret(
  'cron_hef_5VC8YF9GBvs8Xsi1N0r8kEFEFmg29GQPaJt7_oLeb84MfVKE5AZcHxI41kXW',
  'cron_invoke_secret',
  'Shared secret presented by pg_cron via x-cron-secret header to authenticate to guarded edge functions'
);

-- 2) Service-role-only validator used by the shared requireAuth guard
CREATE OR REPLACE FUNCTION public.verify_cron_secret(_s text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM vault.decrypted_secrets
    WHERE name = 'cron_invoke_secret'
      AND decrypted_secret = _s
  );
$$;

REVOKE EXECUTE ON FUNCTION public.verify_cron_secret(text) FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.verify_cron_secret(text) TO service_role;

-- 3) Re-point every cron job that targets a now-guarded function so it sends
--    the x-cron-secret header. Keep the anon apikey for gateway routing.
DO $do$
DECLARE
  v_secret text := 'cron_hef_5VC8YF9GBvs8Xsi1N0r8kEFEFmg29GQPaJt7_oLeb84MfVKE5AZcHxI41kXW';
  v_anon   text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imljcmh2d3d2eW1icXZ1ZG1wd2t5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE1NTM1MTQsImV4cCI6MjA4NzEyOTUxNH0.CoaI2gQ4dNHfMbvRUnOuc5KY0ATsCOa9HtnBjwtCw2s';
  v_base   text := 'https://icrhvwwvymbqvudmpwky.supabase.co/functions/v1/';
  v_hdr    text;
  j RECORD;
  jobs jsonb := jsonb_build_array(
    jsonb_build_object('name','ambient-crawler-every-12h','sched','0 */12 * * *','fn','ambient-crawler','body','{"run_type": "scheduled"}'),
    jsonb_build_object('name','fetch-news-daily','sched','0 0 * * *','fn','fetch-news','body','{"scheduled": true, "force": true}'),
    jsonb_build_object('name','cleanup-raw-content-daily','sched','0 3 * * *','fn','cleanup-raw-content','body','{"triggered_by": "cron"}'),
    jsonb_build_object('name','refresh-media-cdns-daily','sched','0 3 * * *','fn','refresh-media-cdns','body','{}'),
    jsonb_build_object('name','scheduled-media-refresh-96h','sched','0 2 */4 * *','fn','scheduled-media-refresh','body','{"trigger": "cron"}'),
    jsonb_build_object('name','firecrawl-reddit-daily','sched','0 6 * * *','fn','firecrawl-reddit','body','{"dryRun": false, "maxResults": 200}'),
    jsonb_build_object('name','fetch-community-daily-04utc','sched','0 4 * * *','fn','fetch-community','body','{"force": true, "qualityThreshold": 20, "sources": ["reddit", "linkedin"]}'),
    jsonb_build_object('name','news-hydrate-tick','sched','*/2 * * * *','fn','news-hydrate','body','{"trigger": "cron"}')
  );
BEGIN
  v_hdr := jsonb_build_object(
    'Content-Type','application/json',
    'Authorization','Bearer ' || v_anon,
    'apikey', v_anon,
    'x-cron-secret', v_secret
  )::text;

  FOR j IN SELECT * FROM jsonb_array_elements(jobs) AS x(val)
  LOOP
    -- drop the old job if present
    BEGIN
      PERFORM cron.unschedule((j.val->>'name'));
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

    PERFORM cron.schedule(
      (j.val->>'name'),
      (j.val->>'sched'),
      format(
        $cmd$SELECT net.http_post(url:=%L, headers:=%L::jsonb, body:=%L::jsonb) AS request_id;$cmd$,
        v_base || (j.val->>'fn'),
        v_hdr,
        (j.val->>'body')
      )
    );
  END LOOP;
END
$do$;