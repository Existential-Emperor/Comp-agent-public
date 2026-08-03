-- Backfill: strip lines that consist solely of empty-href markdown links
-- (e.g. "[Source]()" or "- [Source]()") from the persisted formatted_output
-- on past agent_traces. We use a regex-replace per row and only touch traces
-- that actually contain such a placeholder.

WITH affected AS (
  SELECT id, formatted_output
  FROM public.agent_traces
  WHERE formatted_output ~ '\[[^\]]+\]\(\s*\)'
),
cleaned AS (
  SELECT
    id,
    -- 1) Drop full lines that are only optional bullet/whitespace + empty-href links.
    regexp_replace(
      formatted_output,
      '(^|\n)[ \t]*[-*•]?[ \t]*(\[[^\]]+\]\(\s*\)[ \t,;|]*)+(?=\n|$)',
      '\1',
      'g'
    ) AS cleaned_output
  FROM affected
)
UPDATE public.agent_traces t
SET
  formatted_output = c.cleaned_output,
  metadata = COALESCE(t.metadata, '{}'::jsonb)
    || jsonb_build_object(
      'empty_source_backfill', jsonb_build_object(
        'cleaned_at', now(),
        'pattern', '[Source]() empty-href stripper'
      )
    )
FROM cleaned c
WHERE t.id = c.id
  AND c.cleaned_output IS DISTINCT FROM t.formatted_output;