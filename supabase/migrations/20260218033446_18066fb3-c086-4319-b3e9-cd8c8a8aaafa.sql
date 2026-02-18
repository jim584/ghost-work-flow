-- Add columns to track when developer marks website as live
ALTER TABLE public.tasks
ADD COLUMN launch_website_live_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
ADD COLUMN launch_website_live_by UUID DEFAULT NULL;

-- Add website_marked_live to notification type constraint
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK (
  type IN (
    'new_task', 'revision_requested', 'task_delayed', 'file_uploaded',
    'order_cancelled', 'late_acknowledgement', 'reassignment_requested',
    'order_message', 'task_started', 'website_launch',
    'nameserver_request', 'nameserver_ready', 'nameserver_confirmed',
    'dns_request', 'dns_ready', 'dns_confirmed',
    'delegate_request', 'delegate_confirmed',
    'hosting_delegate_request', 'hosting_delegate_confirmed',
    'self_launch_link_request', 'self_launch_completed',
    'website_marked_live'
  )
);