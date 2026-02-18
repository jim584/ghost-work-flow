
-- Add DNS workflow columns to tasks table
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS launch_dns_status text,
  ADD COLUMN IF NOT EXISTS launch_dns_a_record text,
  ADD COLUMN IF NOT EXISTS launch_dns_cname text,
  ADD COLUMN IF NOT EXISTS launch_dns_mx_record text;

-- Update notification type constraint to include DNS types
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'new_task', 'revision_requested', 'task_delayed', 'file_uploaded',
    'order_cancelled', 'late_acknowledgement', 'reassignment_requested',
    'order_message', 'website_launch', 'task_started',
    'nameserver_request', 'nameserver_ready', 'nameserver_confirmed',
    'dns_request', 'dns_ready', 'dns_confirmed'
  ));
