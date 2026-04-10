-- Add columns for soft-delete with semantic summary
ALTER TABLE public.chat_threads ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false;
ALTER TABLE public.chat_threads ADD COLUMN IF NOT EXISTS summary text;