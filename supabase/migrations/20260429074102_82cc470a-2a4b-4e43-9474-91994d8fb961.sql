-- Backfill: strip every empty-href markdown link token (e.g. `[Source]()`,
-- `[Source]( )`, `[]()`) from past assistant responses. Cleans BOTH the
-- forensic trace output (`agent_traces.formatted_output`) AND the actual
-- chat history users see (`chat_messages.content`). Tables and prose are
-- both covered because we operate on the raw token, not just whole lines.

-- Step 1: clean agent_traces.formatted_output
WITH affected AS (
  SELECT id, formatted_output
  FROM public.agent_traces
  WHERE formatted_output ~ '\[[^\]]*\]\(\s*\)'
),
cleaned AS (
  SELECT
    id,
    -- 1a) Drop entire lines that are only optional bullet/separator/whitespace + empty-href tokens.
    -- 1b) Drop the residual empty tokens anywhere they survived (table cells, mid-prose).
    regexp_replace(
      regexp_replace(
        formatted_output,
        '(^|\n)[ \t]*[-*•|]?[ \t]*(\[[^\]]*\]\(\s*\)[ \t,;|]*)+(?=\n|$)',
        '\1',
        'g'
      ),
      '\[[^\]]*\]\(\s*\)',
      '',
      'g'
    ) AS cleaned_output
  FROM affected
)
UPDATE public.agent_traces t
SET
  formatted_output = c.cleaned_output,
  metadata = COALESCE(t.metadata, '{}'::jsonb)
    || jsonb_build_object(
      'empty_source_backfill_v2', jsonb_build_object(
        'cleaned_at', now(),
        'pattern', 'empty-href stripper v2 (lines + inline tokens)'
      )
    )
FROM cleaned c
WHERE t.id = c.id
  AND c.cleaned_output IS DISTINCT FROM t.formatted_output;

-- Step 2: clean chat_messages.content for assistant messages
WITH affected_msgs AS (
  SELECT id, content
  FROM public.chat_messages
  WHERE role = 'assistant'
    AND content ~ '\[[^\]]*\]\(\s*\)'
),
cleaned_msgs AS (
  SELECT
    id,
    regexp_replace(
      regexp_replace(
        content,
        '(^|\n)[ \t]*[-*•|]?[ \t]*(\[[^\]]*\]\(\s*\)[ \t,;|]*)+(?=\n|$)',
        '\1',
        'g'
      ),
      '\[[^\]]*\]\(\s*\)',
      '',
      'g'
    ) AS cleaned_content
  FROM affected_msgs
)
UPDATE public.chat_messages m
SET
  content = c.cleaned_content,
  metadata = COALESCE(m.metadata, '{}'::jsonb)
    || jsonb_build_object(
      'empty_source_backfill_v2', jsonb_build_object(
        'cleaned_at', now(),
        'pattern', 'empty-href stripper v2 (lines + inline tokens)'
      )
    )
FROM cleaned_msgs c
WHERE m.id = c.id
  AND c.cleaned_content IS DISTINCT FROM m.content;