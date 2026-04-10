ALTER TABLE public.agent_traces ADD COLUMN trace_type text NOT NULL DEFAULT 'conversation';

COMMENT ON COLUMN public.agent_traces.trace_type IS 'Type of agent action: conversation (chat answers) or search (competitor discovery)';
