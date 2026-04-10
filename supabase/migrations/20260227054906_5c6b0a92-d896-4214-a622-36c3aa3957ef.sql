
-- 1. Role enum & user_roles table for admin access control
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Only admins can view roles
CREATE POLICY "Admins can view all roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 2. agent_traces table
CREATE TABLE public.agent_traces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  thread_id uuid REFERENCES public.chat_threads(id) ON DELETE SET NULL,
  message_id uuid REFERENCES public.chat_messages(id) ON DELETE SET NULL,

  -- Filter state
  category text NOT NULL,
  sub_category text NOT NULL,
  competitor_name text,
  competitor_id uuid,

  -- Prompts
  system_prompt text,
  user_prompt text,

  -- Retrieved context
  retrieved_documents jsonb DEFAULT '[]'::jsonb,
  tool_calls jsonb DEFAULT '[]'::jsonb,

  -- LLM outputs
  raw_llm_output text,
  formatted_output text,
  model_used text,

  -- Judge / evaluation scores
  judge_scores jsonb DEFAULT '{}'::jsonb,
  overall_score numeric,

  -- Performance
  latency_ms integer,
  prompt_tokens integer,
  completion_tokens integer,
  total_tokens integer,

  -- Status
  status text NOT NULL DEFAULT 'pending',
  error_message text,

  -- User feedback
  feedback_vote text CHECK (feedback_vote IN ('like', 'dislike', NULL)),
  feedback_comment text,

  -- Metadata
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.agent_traces ENABLE ROW LEVEL SECURITY;

-- RLS: users can view/update their own traces (for feedback)
CREATE POLICY "Users can view own traces"
  ON public.agent_traces FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own traces"
  ON public.agent_traces FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own traces"
  ON public.agent_traces FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

-- Admins can view ALL traces
CREATE POLICY "Admins can view all traces"
  ON public.agent_traces FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 3. Indexes for filtering
CREATE INDEX idx_agent_traces_user_id ON public.agent_traces(user_id);
CREATE INDEX idx_agent_traces_category ON public.agent_traces(category);
CREATE INDEX idx_agent_traces_sub_category ON public.agent_traces(sub_category);
CREATE INDEX idx_agent_traces_competitor_name ON public.agent_traces(competitor_name);
CREATE INDEX idx_agent_traces_overall_score ON public.agent_traces(overall_score);
CREATE INDEX idx_agent_traces_created_at ON public.agent_traces(created_at DESC);
CREATE INDEX idx_agent_traces_status ON public.agent_traces(status);
CREATE INDEX idx_agent_traces_feedback ON public.agent_traces(feedback_vote);
CREATE INDEX idx_agent_traces_thread_id ON public.agent_traces(thread_id);

-- 4. Auto-update timestamp trigger
CREATE TRIGGER update_agent_traces_updated_at
  BEFORE UPDATE ON public.agent_traces
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
