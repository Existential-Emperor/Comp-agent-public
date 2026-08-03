-- customers ----------------------------------------------------------------
CREATE TABLE public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_external_id text NOT NULL,
  customer_name text NOT NULL,
  customer_url text,
  match_status text NOT NULL DEFAULT 'pending',
  matched_competitors text[] NOT NULL DEFAULT '{}',
  match_details jsonb,
  last_checked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customers_external_id_unique UNIQUE (customer_external_id),
  CONSTRAINT customers_match_status_check CHECK (match_status IN ('pending','matched','unmatched'))
);

CREATE INDEX customers_match_status_idx ON public.customers (match_status);
CREATE INDEX customers_name_trgm_idx ON public.customers USING gin (customer_name gin_trgm_ops);
CREATE INDEX customers_url_trgm_idx ON public.customers USING gin (customer_url gin_trgm_ops);
CREATE INDEX customers_external_id_trgm_idx ON public.customers USING gin (customer_external_id gin_trgm_ops);
CREATE INDEX customers_matched_competitors_idx ON public.customers USING gin (matched_competitors);

GRANT SELECT ON public.customers TO authenticated;
GRANT ALL ON public.customers TO service_role;

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workday users can read customers"
  ON public.customers FOR SELECT
  TO authenticated
  USING (public.is_workday_user());

CREATE TRIGGER update_customers_updated_at
  BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- competitor_tenant_index ---------------------------------------------------
CREATE TABLE public.competitor_tenant_index (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competitor text NOT NULL,
  tenant_slug text NOT NULL,
  observed_hostname text NOT NULL,
  source text NOT NULL DEFAULT 'crt.sh',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT competitor_tenant_index_unique UNIQUE (competitor, observed_hostname)
);

CREATE INDEX competitor_tenant_index_lookup_idx ON public.competitor_tenant_index (competitor, tenant_slug);

GRANT SELECT ON public.competitor_tenant_index TO authenticated;
GRANT ALL ON public.competitor_tenant_index TO service_role;

ALTER TABLE public.competitor_tenant_index ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workday users can read competitor tenant index"
  ON public.competitor_tenant_index FOR SELECT
  TO authenticated
  USING (public.is_workday_user());