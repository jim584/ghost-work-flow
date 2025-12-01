-- Enable required extensions for cron jobs
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Create table to track delay notifications
CREATE TABLE IF NOT EXISTS public.task_delay_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  notification_sent_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.task_delay_notifications ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to view delay notifications
CREATE POLICY "Users can view delay notifications"
ON public.task_delay_notifications
FOR SELECT
TO authenticated
USING (auth.uid() IS NOT NULL);

-- Allow the service role to manage delay notifications
CREATE POLICY "Service role can manage delay notifications"
ON public.task_delay_notifications
FOR ALL
TO service_role
USING (true);

-- Create index for performance
CREATE INDEX idx_task_delay_notifications_task_id ON public.task_delay_notifications(task_id);
CREATE INDEX idx_task_delay_notifications_sent_at ON public.task_delay_notifications(notification_sent_at);