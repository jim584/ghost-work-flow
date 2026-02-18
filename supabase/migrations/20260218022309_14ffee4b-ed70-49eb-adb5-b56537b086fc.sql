
-- Add launch_delegate_status column to tasks table
ALTER TABLE public.tasks 
ADD COLUMN launch_delegate_status text;

-- Update notification type constraint to include delegate types
ALTER TABLE public.notifications 
DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications 
ADD CONSTRAINT notifications_type_check 
CHECK (type IN (
  'new_task', 'revision_requested', 'task_delayed', 'file_uploaded', 
  'order_cancelled', 'late_acknowledgement', 'reassignment_requested', 
  'order_message', 'task_started', 'website_launch', 
  'nameserver_request', 'nameserver_ready', 'nameserver_confirmed',
  'dns_request', 'dns_ready', 'dns_confirmed',
  'delegate_request', 'delegate_confirmed'
));
