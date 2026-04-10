
CREATE POLICY "Admins can view all messages"
ON public.chat_messages
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can view all threads"
ON public.chat_threads
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));
