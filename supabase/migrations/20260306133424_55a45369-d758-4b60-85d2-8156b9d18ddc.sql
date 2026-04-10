
CREATE TABLE public.news_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  summary text,
  source_url text NOT NULL,
  source_name text,
  image_url text,
  item_type text NOT NULL DEFAULT 'news',
  published_at timestamp with time zone,
  fetched_at timestamp with time zone NOT NULL DEFAULT now(),
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.news_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view news_items"
  ON public.news_items FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Service role insert news_items"
  ON public.news_items FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Service role update news_items"
  ON public.news_items FOR UPDATE TO authenticated
  USING (true);

CREATE POLICY "Service role delete news_items"
  ON public.news_items FOR DELETE TO authenticated
  USING (true);

CREATE INDEX idx_news_items_type ON public.news_items (item_type);
CREATE INDEX idx_news_items_fetched_at ON public.news_items (fetched_at DESC);
