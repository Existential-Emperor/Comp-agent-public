-- competitor_profiles: canonical facts from XLSX
CREATE TABLE public.competitor_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  website text,
  links jsonb NOT NULL DEFAULT '[]'::jsonb,
  segments text[] NOT NULL DEFAULT '{}'::text[],
  market_focus text,
  founder text,
  funding text,
  product_focus text,
  category text,
  momentum text,
  market_size text,
  extra jsonb NOT NULL DEFAULT '{}'::jsonb,
  source text NOT NULL DEFAULT 'workday_fpa_report_xlsx',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_competitor_profiles_name_lower ON public.competitor_profiles (lower(name));

ALTER TABLE public.competitor_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view competitor_profiles"
  ON public.competitor_profiles FOR SELECT TO authenticated USING (true);

CREATE POLICY "Service role insert competitor_profiles"
  ON public.competitor_profiles FOR INSERT TO service_role WITH CHECK (true);

CREATE POLICY "Service role update competitor_profiles"
  ON public.competitor_profiles FOR UPDATE TO service_role USING (true);

CREATE POLICY "Service role delete competitor_profiles"
  ON public.competitor_profiles FOR DELETE TO service_role USING (true);

CREATE TRIGGER trg_competitor_profiles_updated_at
  BEFORE UPDATE ON public.competitor_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- competitor_product_area_mappings: junction
CREATE TABLE public.competitor_product_area_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competitor_id uuid NOT NULL REFERENCES public.competitor_profiles(id) ON DELETE CASCADE,
  category text NOT NULL,
  sub_category text NOT NULL,
  confidence numeric,
  rationale text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (competitor_id, category, sub_category)
);

CREATE INDEX idx_cpam_category ON public.competitor_product_area_mappings (category, sub_category);

ALTER TABLE public.competitor_product_area_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view cpam"
  ON public.competitor_product_area_mappings FOR SELECT TO authenticated USING (true);

CREATE POLICY "Service role insert cpam"
  ON public.competitor_product_area_mappings FOR INSERT TO service_role WITH CHECK (true);

CREATE POLICY "Service role update cpam"
  ON public.competitor_product_area_mappings FOR UPDATE TO service_role USING (true);

CREATE POLICY "Service role delete cpam"
  ON public.competitor_product_area_mappings FOR DELETE TO service_role USING (true);