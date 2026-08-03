DROP POLICY IF EXISTS "Authenticated insert competitor_profiles" ON public.competitor_profiles;
DROP POLICY IF EXISTS "Authenticated update competitor_profiles" ON public.competitor_profiles;
DROP POLICY IF EXISTS "Authenticated insert cpam" ON public.competitor_product_area_mappings;
DROP POLICY IF EXISTS "Authenticated update cpam" ON public.competitor_product_area_mappings;
REVOKE INSERT, UPDATE ON public.competitor_profiles FROM sandbox_exec;
REVOKE INSERT, UPDATE ON public.competitor_product_area_mappings FROM sandbox_exec;