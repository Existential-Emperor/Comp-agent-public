
CREATE TABLE public.news_ingestion_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL,
  competitor_name text NOT NULL,
  source_url text NOT NULL,
  title text,
  snippet text,
  status text NOT NULL DEFAULT 'pending',
  published_at timestamptz,
  summary text,
  image_url text,
  source_name text,
  retry_count int NOT NULL DEFAULT 0,
  last_error text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX news_ingestion_queue_source_url_idx ON public.news_ingestion_queue (source_url);
CREATE INDEX news_ingestion_queue_status_created_idx ON public.news_ingestion_queue (status, created_at);
CREATE INDEX news_ingestion_queue_run_idx ON public.news_ingestion_queue (run_id);

ALTER TABLE public.news_ingestion_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view news_ingestion_queue"
  ON public.news_ingestion_queue FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role insert news_ingestion_queue"
  ON public.news_ingestion_queue FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role update news_ingestion_queue"
  ON public.news_ingestion_queue FOR UPDATE
  TO service_role
  USING (true);

CREATE POLICY "Service role delete news_ingestion_queue"
  ON public.news_ingestion_queue FOR DELETE
  TO service_role
  USING (true);

CREATE POLICY "Service role select news_ingestion_queue"
  ON public.news_ingestion_queue FOR SELECT
  TO service_role
  USING (true);

CREATE TRIGGER update_news_ingestion_queue_updated_at
  BEFORE UPDATE ON public.news_ingestion_queue
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
