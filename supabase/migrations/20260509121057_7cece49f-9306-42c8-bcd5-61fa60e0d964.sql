ALTER TABLE public.news_items
  ADD COLUMN IF NOT EXISTS quality_subjecthood smallint,
  ADD COLUMN IF NOT EXISTS quality_genre_fit smallint,
  ADD COLUMN IF NOT EXISTS quality_substance smallint,
  ADD COLUMN IF NOT EXISTS quality_independence smallint,
  ADD COLUMN IF NOT EXISTS quality_total smallint;