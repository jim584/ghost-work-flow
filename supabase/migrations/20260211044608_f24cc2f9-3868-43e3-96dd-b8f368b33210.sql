
-- Add acknowledgement deadline and late ack tracking to tasks
ALTER TABLE public.tasks 
ADD COLUMN IF NOT EXISTS ack_deadline timestamp with time zone,
ADD COLUMN IF NOT EXISTS late_acknowledgement boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS reassignment_requested_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS reassignment_request_reason text;

-- Add notification type for late_acknowledgement and reassignment_requested
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check 
CHECK (type IN ('new_task', 'revision_requested', 'task_delayed', 'file_uploaded', 'order_cancelled', 'late_acknowledgement', 'reassignment_requested'));
