
CREATE TABLE public.media_assets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  competitor_name TEXT NOT NULL,
  product_area TEXT NOT NULL,
  product_sub_area TEXT NOT NULL,
  page_url TEXT NOT NULL,
  cdn_url TEXT,
  storage_url TEXT NOT NULL,
  media_type TEXT NOT NULL DEFAULT 'image',
  source_type TEXT NOT NULL DEFAULT 'inline',
  alt_text TEXT,
  file_size_bytes INTEGER,
  captured_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  last_refreshed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  is_active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Index for fast lookups by competitor + product area
CREATE INDEX idx_media_assets_competitor ON public.media_assets (competitor_name, product_area, product_sub_area);
CREATE INDEX idx_media_assets_page_url ON public.media_assets (page_url);

-- Unique constraint to avoid duplicates
CREATE UNIQUE INDEX idx_media_assets_unique ON public.media_assets (competitor_name, page_url, storage_url);

-- Enable RLS
ALTER TABLE public.media_assets ENABLE ROW LEVEL SECURITY;

-- Authenticated users can view
CREATE POLICY "Authenticated users can view media_assets"
  ON public.media_assets FOR SELECT TO authenticated
  USING (true);

-- Service role can manage
CREATE POLICY "Service role insert media_assets"
  ON public.media_assets FOR INSERT TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role update media_assets"
  ON public.media_assets FOR UPDATE TO service_role
  USING (true);

CREATE POLICY "Service role delete media_assets"
  ON public.media_assets FOR DELETE TO service_role
  USING (true);

-- Updated_at trigger
CREATE TRIGGER update_media_assets_updated_at
  BEFORE UPDATE ON public.media_assets
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
