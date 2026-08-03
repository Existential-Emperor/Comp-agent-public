ALTER TABLE public.news_ingestion_queue
  ADD COLUMN IF NOT EXISTS date_source text,
  ADD COLUMN IF NOT EXISTS needs_date_review boolean NOT NULL DEFAULT false;

ALTER TABLE public.news_items
  ADD COLUMN IF NOT EXISTS date_source text,
  ADD COLUMN IF NOT EXISTS needs_date_review boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_news_items_needs_date_review
  ON public.news_items (needs_date_review) WHERE needs_date_review = true;