
-- Add 'development_team_leader' to app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'development_team_leader';

-- Add 'late_acknowledgement' to the notifications type check constraint
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check 
  CHECK (type IN ('new_task', 'revision_requested', 'task_delayed', 'file_uploaded', 'order_cancelled', 'late_acknowledgement'));
