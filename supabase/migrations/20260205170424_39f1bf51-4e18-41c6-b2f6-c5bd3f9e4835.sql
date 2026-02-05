-- Drop the correct constraint name and recreate with file_uploaded
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check 
CHECK (type IN ('new_task', 'revision_requested', 'task_delayed', 'file_uploaded'));