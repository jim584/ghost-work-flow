-- Add policy to allow users to insert their own notifications
CREATE POLICY "Users can insert their own notifications"
ON public.notifications
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Also add a policy to allow service role to insert for anyone (for edge functions)
DROP POLICY IF EXISTS "Service role can insert notifications" ON public.notifications;

CREATE POLICY "Service role can manage notifications"
ON public.notifications
FOR ALL
USING (true)
WITH CHECK (true);