
-- Add 'phase_review' to the notifications type check constraint
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check 
  CHECK (type IN ('new_task', 'revision_requested', 'task_delayed', 'file_uploaded', 'order_cancelled', 'late_acknowledgement', 'reassignment_requested', 'phase_review'));
