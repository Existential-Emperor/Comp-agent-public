
-- Fix: restrict write access to service role only
DROP POLICY "Service role full access on competitor_pages" ON public.competitor_pages;
DROP POLICY "Service role full access on crawler_runs" ON public.crawler_runs;

-- competitor_pages: only service_role can insert/update/delete (edge functions)
CREATE POLICY "Service role insert competitor_pages"
ON public.competitor_pages
FOR INSERT
TO service_role
WITH CHECK (true);

CREATE POLICY "Service role update competitor_pages"
ON public.competitor_pages
FOR UPDATE
TO service_role
USING (true);

CREATE POLICY "Service role delete competitor_pages"
ON public.competitor_pages
FOR DELETE
TO service_role
USING (true);

-- crawler_runs: only service_role can insert/update
CREATE POLICY "Service role insert crawler_runs"
ON public.crawler_runs
FOR INSERT
TO service_role
WITH CHECK (true);

CREATE POLICY "Service role update crawler_runs"
ON public.crawler_runs
FOR UPDATE
TO service_role
USING (true);
