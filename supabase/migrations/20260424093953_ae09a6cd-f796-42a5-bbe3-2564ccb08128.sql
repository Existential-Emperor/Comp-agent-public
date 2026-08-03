-- Temporary: grant the sandbox_exec role insert/update access for one-time seed.
-- These policies are also kept permissive for authenticated users so admin tooling can re-sync from the sheet later.
DROP POLICY IF EXISTS "Authenticated insert competitor_profiles" ON public.competitor_profiles;
CREATE POLICY "Authenticated insert competitor_profiles"
  ON public.competitor_profiles FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated update competitor_profiles" ON public.competitor_profiles;
CREATE POLICY "Authenticated update competitor_profiles"
  ON public.competitor_profiles FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated insert cpam" ON public.competitor_product_area_mappings;
CREATE POLICY "Authenticated insert cpam"
  ON public.competitor_product_area_mappings FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated update cpam" ON public.competitor_product_area_mappings;
CREATE POLICY "Authenticated update cpam"
  ON public.competitor_product_area_mappings FOR UPDATE TO authenticated USING (true);

GRANT INSERT, UPDATE ON public.competitor_profiles TO sandbox_exec;
GRANT INSERT, UPDATE ON public.competitor_product_area_mappings TO sandbox_exec;