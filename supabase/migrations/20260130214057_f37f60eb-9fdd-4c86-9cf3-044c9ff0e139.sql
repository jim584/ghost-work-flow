-- Fix linter warning: overly-permissive RLS policies using (true)
-- Restrict these policies to requests that are actually using a service-role JWT.

-- notifications
DROP POLICY IF EXISTS "Service role can insert notifications" ON public.notifications;
CREATE POLICY "Service role can insert notifications"
ON public.notifications
AS PERMISSIVE
FOR INSERT
WITH CHECK ((auth.jwt() ->> 'role') = 'service_role');

-- task_delay_notifications
DROP POLICY IF EXISTS "Service role can manage delay notifications" ON public.task_delay_notifications;
CREATE POLICY "Service role can manage delay notifications"
ON public.task_delay_notifications
AS PERMISSIVE
FOR ALL
USING ((auth.jwt() ->> 'role') = 'service_role')
WITH CHECK ((auth.jwt() ->> 'role') = 'service_role');
