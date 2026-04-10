ALTER TABLE public.newsletter_subscribers
ADD COLUMN IF NOT EXISTS user_id uuid;

UPDATE public.newsletter_subscribers ns
SET user_id = p.user_id
FROM public.profiles p
WHERE ns.user_id IS NULL
  AND p.email IS NOT NULL
  AND lower(p.email) = lower(ns.email);

DELETE FROM public.newsletter_subscribers
WHERE user_id IS NULL;

ALTER TABLE public.newsletter_subscribers
ALTER COLUMN user_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS newsletter_subscribers_user_id_key
ON public.newsletter_subscribers (user_id);

DROP POLICY IF EXISTS "Authenticated users can insert subscribers" ON public.newsletter_subscribers;
DROP POLICY IF EXISTS "Service role can manage subscribers" ON public.newsletter_subscribers;
DROP POLICY IF EXISTS "Users can view own subscription" ON public.newsletter_subscribers;

CREATE POLICY "Users can insert own subscription"
  ON public.newsletter_subscribers FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own subscription"
  ON public.newsletter_subscribers FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own subscription"
  ON public.newsletter_subscribers FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);