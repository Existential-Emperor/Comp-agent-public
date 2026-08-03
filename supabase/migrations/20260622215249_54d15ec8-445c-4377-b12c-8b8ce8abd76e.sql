ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS valid_domains text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS country text;