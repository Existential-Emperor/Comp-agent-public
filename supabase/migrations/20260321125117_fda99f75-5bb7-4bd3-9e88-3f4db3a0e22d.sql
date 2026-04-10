CREATE TABLE public.saved_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  news_item_id uuid NOT NULL REFERENCES public.news_items(id) ON DELETE CASCADE,
  saved_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(user_id, news_item_id)
);

ALTER TABLE public.saved_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own saved items"
  ON public.saved_items FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own saved items"
  ON public.saved_items FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own saved items"
  ON public.saved_items FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);