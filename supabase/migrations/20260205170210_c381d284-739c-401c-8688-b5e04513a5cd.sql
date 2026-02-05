-- Drop the existing check constraint and add updated one with file_uploaded type
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notification_type_check;

ALTER TABLE public.notifications ADD CONSTRAINT notification_type_check 
CHECK (type IN ('new_task', 'revision_requested', 'task_delayed', 'file_uploaded'));