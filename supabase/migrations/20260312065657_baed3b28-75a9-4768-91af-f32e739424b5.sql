
CREATE TABLE public.newsletter_subscribers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  subscribed_at timestamp with time zone NOT NULL DEFAULT now(),
  is_active boolean NOT NULL DEFAULT true,
  last_sent_at timestamp with time zone,
  metadata jsonb DEFAULT '{}'::jsonb
);

ALTER TABLE public.newsletter_subscribers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can insert subscribers"
  ON public.newsletter_subscribers FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Service role can manage subscribers"
  ON public.newsletter_subscribers FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Users can view own subscription"
  ON public.newsletter_subscribers FOR SELECT
  TO authenticated
  USING (true);
