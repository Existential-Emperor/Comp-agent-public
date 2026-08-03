CREATE OR REPLACE FUNCTION public.search_adaptive_kb(q text, max_rows integer DEFAULT 30)
 RETURNS TABLE(id uuid, source_doc text, section_path text, title text, content text, topics text[], rank real)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  cleaned text;
  tokens text[];
  tsq tsquery;
BEGIN
  -- Normalize: lowercase, drop non-word chars, collapse whitespace
  cleaned := lower(coalesce(nullif(trim(q), ''), 'adaptive planning'));
  cleaned := regexp_replace(cleaned, '[^a-z0-9\s-]', ' ', 'g');
  cleaned := regexp_replace(cleaned, '\s+', ' ', 'g');

  -- Tokenize, drop stopwords/short tokens, dedupe
  SELECT array_agg(DISTINCT t) INTO tokens
  FROM unnest(string_to_array(cleaned, ' ')) t
  WHERE length(t) >= 3
    AND t NOT IN (
      'the','and','for','with','from','this','that','what','how','why','when','where',
      'are','was','were','has','have','had','can','does','did','you','your','our',
      'into','about','vs','versus','workday','adaptive','planning'
    );

  IF tokens IS NULL OR array_length(tokens, 1) IS NULL THEN
    -- Fallback: original websearch behavior so we still return something
    tsq := websearch_to_tsquery('english', cleaned);
  ELSE
    -- OR-join tokens: any keyword match is a candidate; ts_rank_cd ranks by overlap
    tsq := to_tsquery('english', array_to_string(tokens, ' | '));
  END IF;

  RETURN QUERY
  SELECT k.id, k.source_doc, k.section_path, k.title, k.content, k.topics,
         ts_rank_cd(k.search_tsv, tsq) AS rank
  FROM public.adaptive_planning_kb k
  WHERE k.search_tsv @@ tsq
  ORDER BY rank DESC
  LIMIT greatest(1, least(coalesce(max_rows, 30), 100));
END;
$function$;