update public.agent_traces
set metadata = metadata
  || jsonb_build_object(
       'slide_summary_model_actual', 'openai/gpt-5-mini',
       'slide_summary_label_corrected_at', now()
     )
where metadata->>'slide_summary_status' = 'failed'
  and metadata->>'slide_summary_model'   = 'openai/gpt-5.2'
  and (metadata ? 'slide_summary_diagnostics') = false;