-- Part 1: roadmap_kb shared knowledge base (admin-only), parallel to adaptive_planning_kb

CREATE TABLE public.roadmap_kb (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  uploaded_by uuid NOT NULL,
  original_filename text NOT NULL,
  mime_type text NOT NULL,
  file_size_bytes integer NOT NULL,
  storage_path text NOT NULL,
  parsed_content text NOT NULL,
  parsed_content_format text NOT NULL DEFAULT 'markdown',
  chunk_count integer NOT NULL DEFAULT 0,
  search_tsv tsvector GENERATED ALWAYS AS (to_tsvector('english', coalesce(parsed_content, ''))) STORED,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.roadmap_kb TO authenticated;
GRANT ALL ON public.roadmap_kb TO service_role;

ALTER TABLE public.roadmap_kb ENABLE ROW LEVEL SECURITY;

-- Shared KB: any admin (the same allow-list as /admin/api-credits) can read/insert/delete
-- ALL rows regardless of uploader. Service role (backend retrieval) bypasses RLS.
CREATE POLICY "Admins can read roadmap_kb"
  ON public.roadmap_kb FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert roadmap_kb"
  ON public.roadmap_kb FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') AND uploaded_by = auth.uid());

CREATE POLICY "Admins can delete roadmap_kb"
  ON public.roadmap_kb FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Indexes
CREATE INDEX idx_roadmap_kb_search_tsv ON public.roadmap_kb USING gin (search_tsv);
CREATE INDEX idx_roadmap_kb_uploaded_by ON public.roadmap_kb (uploaded_by);

-- updated_at trigger (reuses existing helper)
CREATE TRIGGER update_roadmap_kb_updated_at
  BEFORE UPDATE ON public.roadmap_kb
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- FTS narrowing RPC mirroring search_adaptive_kb shape (id, source_doc, section_path, title, content, rank)
CREATE OR REPLACE FUNCTION public.search_roadmap_kb(q text, max_rows integer DEFAULT 30)
RETURNS TABLE(id uuid, source_doc text, section_path text, title text, content text, rank real)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  cleaned text;
  tokens text[];
  tsq tsquery;
BEGIN
  cleaned := lower(coalesce(nullif(trim(q), ''), 'roadmap'));
  cleaned := regexp_replace(cleaned, '[^a-z0-9\s-]', ' ', 'g');
  cleaned := regexp_replace(cleaned, '\s+', ' ', 'g');

  SELECT array_agg(DISTINCT t) INTO tokens
  FROM unnest(string_to_array(cleaned, ' ')) t
  WHERE length(t) >= 3
    AND t NOT IN (
      'the','and','for','with','from','this','that','what','how','why','when','where',
      'are','was','were','has','have','had','can','does','did','you','your','our',
      'into','about','vs','versus','workday','adaptive','planning'
    );

  IF tokens IS NULL OR array_length(tokens, 1) IS NULL THEN
    tsq := websearch_to_tsquery('english', cleaned);
  ELSE
    tsq := to_tsquery('english', array_to_string(tokens, ' | '));
  END IF;

  RETURN QUERY
  SELECT k.id,
         k.original_filename AS source_doc,
         NULL::text AS section_path,
         k.original_filename AS title,
         k.parsed_content AS content,
         ts_rank_cd(k.search_tsv, tsq) AS rank
  FROM public.roadmap_kb k
  WHERE k.search_tsv @@ tsq
  ORDER BY rank DESC
  LIMIT greatest(1, least(coalesce(max_rows, 30), 100));
END;
$function$;

-- Storage RLS: admins manage objects in the private roadmap-uploads bucket;
-- the edge function reads via service role (bypasses RLS).
CREATE POLICY "Admins manage roadmap uploads"
  ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'roadmap-uploads' AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (bucket_id = 'roadmap-uploads' AND public.has_role(auth.uid(), 'admin'));