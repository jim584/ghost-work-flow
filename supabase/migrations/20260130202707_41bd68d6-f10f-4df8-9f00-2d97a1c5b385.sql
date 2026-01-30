-- Fix 1: Restrict task_delay_notifications visibility to admins and PMs only
DROP POLICY IF EXISTS "Users can view delay notifications" ON public.task_delay_notifications;

CREATE POLICY "Admins and PMs can view delay notifications"
ON public.task_delay_notifications
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'project_manager'::app_role));

-- Fix 4: Make design-files bucket private for better security
UPDATE storage.buckets SET public = false WHERE id = 'design-files';