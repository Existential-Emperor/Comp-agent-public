DROP POLICY IF EXISTS "Users can view own traces" ON public.agent_traces;
DROP POLICY IF EXISTS "Admins can view all traces" ON public.agent_traces;

CREATE POLICY "Users can view own traces"
  ON public.agent_traces
  FOR SELECT
  TO authenticated
  USING ((auth.uid() = user_id) OR public.has_role(auth.uid(), 'admin'));