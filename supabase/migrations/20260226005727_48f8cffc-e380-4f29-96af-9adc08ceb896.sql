
-- Fix 1: Remove permissive INSERT/UPDATE on competitors (service role handles writes)
DROP POLICY IF EXISTS "Authenticated users can insert competitors" ON public.competitors;
DROP POLICY IF EXISTS "Authenticated users can update competitors" ON public.competitors;

-- Fix 2: Evaluation scores - add DELETE policy and fix INSERT policy
DROP POLICY IF EXISTS "Authenticated can insert scores" ON public.evaluation_scores;
CREATE POLICY "Users can insert own scores" ON public.evaluation_scores FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own scores" ON public.evaluation_scores FOR DELETE USING (auth.uid() = user_id);

-- Fix 3: Restrict validated_responses SELECT to owner only
DROP POLICY IF EXISTS "Users can view validated responses" ON public.validated_responses;
CREATE POLICY "Users can view own validated responses" ON public.validated_responses FOR SELECT USING (auth.uid() = user_id);
