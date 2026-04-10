-- Table to track API key exhaustion and rate-limit events
CREATE TABLE public.api_key_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key_name text NOT NULL,
  service text NOT NULL,
  event_type text NOT NULL DEFAULT 'credits_exhausted',
  http_status integer,
  error_message text,
  edge_function text,
  metadata jsonb DEFAULT '{}'::jsonb,
  notified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_api_key_events_created ON public.api_key_events(created_at DESC);
CREATE INDEX idx_api_key_events_key ON public.api_key_events(key_name, created_at DESC);

ALTER TABLE public.api_key_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role insert api_key_events"
  ON public.api_key_events FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Admins can view api_key_events"
  ON public.api_key_events FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role select api_key_events"
  ON public.api_key_events FOR SELECT
  TO service_role
  USING (true);

CREATE POLICY "Service role update api_key_events"
  ON public.api_key_events FOR UPDATE
  TO service_role
  USING (true);