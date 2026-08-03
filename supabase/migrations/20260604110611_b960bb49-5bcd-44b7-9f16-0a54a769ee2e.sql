REVOKE EXECUTE ON FUNCTION public.search_roadmap_kb(text, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.search_roadmap_kb(text, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.search_roadmap_kb(text, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.search_roadmap_kb(text, integer) TO service_role;