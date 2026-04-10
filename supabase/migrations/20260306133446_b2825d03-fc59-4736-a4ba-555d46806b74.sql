
DROP POLICY "Service role insert news_items" ON public.news_items;
DROP POLICY "Service role update news_items" ON public.news_items;
DROP POLICY "Service role delete news_items" ON public.news_items;

CREATE POLICY "Service role insert news_items"
  ON public.news_items FOR INSERT TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role update news_items"
  ON public.news_items FOR UPDATE TO service_role
  USING (true);

CREATE POLICY "Service role delete news_items"
  ON public.news_items FOR DELETE TO service_role
  USING (true);
