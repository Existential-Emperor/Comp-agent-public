-- =============================================================
-- Security hardening migration
-- =============================================================

-- 1) Server-side @workday.com authorization gate ------------------------------
-- The client-only email-domain check (Auth.tsx / App.tsx) does not stop a
-- self-registered account from reading shared competitive-intelligence data via
-- the Data API. Enforce the domain at the data layer with a SECURITY DEFINER
-- helper and gate the broadly-readable shared tables on it.
CREATE OR REPLACE FUNCTION public.is_workday_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = auth.uid()
      AND lower(email) LIKE '%@workday.com'
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_workday_user() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.is_workday_user() TO authenticated;

-- Re-scope shared-data SELECT policies from "any authenticated" to "@workday.com".
DROP POLICY IF EXISTS "Authenticated users can view competitors" ON public.competitors;
CREATE POLICY "Workday users can view competitors" ON public.competitors
  FOR SELECT TO authenticated USING (public.is_workday_user());

DROP POLICY IF EXISTS "Authenticated users can view news_items" ON public.news_items;
CREATE POLICY "Workday users can view news_items" ON public.news_items
  FOR SELECT TO authenticated USING (public.is_workday_user());

DROP POLICY IF EXISTS "Authenticated users can view media_assets" ON public.media_assets;
CREATE POLICY "Workday users can view media_assets" ON public.media_assets
  FOR SELECT TO authenticated USING (public.is_workday_user());

DROP POLICY IF EXISTS "Authenticated users can view competitor_pages" ON public.competitor_pages;
CREATE POLICY "Workday users can view competitor_pages" ON public.competitor_pages
  FOR SELECT TO authenticated USING (public.is_workday_user());

DROP POLICY IF EXISTS "Authenticated can view competitor_profiles" ON public.competitor_profiles;
CREATE POLICY "Workday users can view competitor_profiles" ON public.competitor_profiles
  FOR SELECT TO authenticated USING (public.is_workday_user());

DROP POLICY IF EXISTS "Authenticated can view cpam" ON public.competitor_product_area_mappings;
CREATE POLICY "Workday users can view cpam" ON public.competitor_product_area_mappings
  FOR SELECT TO authenticated USING (public.is_workday_user());

DROP POLICY IF EXISTS "Authenticated users can view crawler_runs" ON public.crawler_runs;
CREATE POLICY "Workday users can view crawler_runs" ON public.crawler_runs
  FOR SELECT TO authenticated USING (public.is_workday_user());

-- 2) Storage: remove public INSERT/DELETE on competitor-screenshots -----------
-- These policies targeted the {public} role, letting any unauthenticated caller
-- upload/delete objects. The screenshot-worker uses the service-role key, which
-- bypasses RLS, so dropping these public-facing policies does not affect it.
DROP POLICY IF EXISTS "Service role can upload competitor screenshots" ON storage.objects;
DROP POLICY IF EXISTS "Service role can delete competitor screenshots" ON storage.objects;

-- 3) Revoke anon EXECUTE on app-defined SECURITY DEFINER functions ------------
-- The app requires authentication; anon never needs these.
REVOKE EXECUTE ON FUNCTION public.search_adaptive_kb(text, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.search_roadmap_kb(text, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.stamp_trace_client_metadata(uuid, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon;