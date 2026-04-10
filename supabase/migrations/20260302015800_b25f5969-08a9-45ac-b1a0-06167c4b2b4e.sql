
-- Table to store crawled competitor page knowledge
CREATE TABLE public.competitor_pages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  competitor_name TEXT NOT NULL,
  page_url TEXT NOT NULL,
  page_type TEXT NOT NULL DEFAULT 'docs', -- docs, help, blog, community, product
  title TEXT,
  content_summary TEXT, -- condensed knowledge extract
  raw_content TEXT, -- full scraped content (markdown)
  screenshot_urls TEXT[] DEFAULT '{}', -- array of storage bucket URLs
  content_hash TEXT, -- hash of content for change detection
  word_count INTEGER DEFAULT 0,
  last_crawled_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  content_updated_at TIMESTAMP WITH TIME ZONE, -- when content actually changed
  crawl_status TEXT NOT NULL DEFAULT 'pending', -- pending, crawling, completed, failed
  error_message TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(competitor_name, page_url)
);

-- Index for fast lookups by competitor
CREATE INDEX idx_competitor_pages_competitor ON public.competitor_pages(competitor_name);
CREATE INDEX idx_competitor_pages_type ON public.competitor_pages(page_type);
CREATE INDEX idx_competitor_pages_status ON public.competitor_pages(crawl_status);
CREATE INDEX idx_competitor_pages_last_crawled ON public.competitor_pages(last_crawled_at);

-- Enable RLS
ALTER TABLE public.competitor_pages ENABLE ROW LEVEL SECURITY;

-- Service role can do everything (edge functions use service role)
CREATE POLICY "Service role full access on competitor_pages"
ON public.competitor_pages
FOR ALL
USING (true)
WITH CHECK (true);

-- Authenticated users can read
CREATE POLICY "Authenticated users can view competitor_pages"
ON public.competitor_pages
FOR SELECT
TO authenticated
USING (true);

-- Trigger for updated_at
CREATE TRIGGER update_competitor_pages_updated_at
BEFORE UPDATE ON public.competitor_pages
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Table to track ambient crawler runs
CREATE TABLE public.crawler_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  run_type TEXT NOT NULL DEFAULT 'scheduled', -- scheduled, manual, initial
  status TEXT NOT NULL DEFAULT 'running', -- running, completed, failed
  competitors_processed INTEGER DEFAULT 0,
  pages_crawled INTEGER DEFAULT 0,
  pages_updated INTEGER DEFAULT 0,
  screenshots_taken INTEGER DEFAULT 0,
  errors TEXT[] DEFAULT '{}',
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE,
  metadata JSONB DEFAULT '{}'::jsonb
);

ALTER TABLE public.crawler_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on crawler_runs"
ON public.crawler_runs
FOR ALL
USING (true)
WITH CHECK (true);

CREATE POLICY "Authenticated users can view crawler_runs"
ON public.crawler_runs
FOR SELECT
TO authenticated
USING (true);
