
-- Add new columns for client hosting access method workflow
ALTER TABLE public.tasks
ADD COLUMN IF NOT EXISTS launch_hosting_access_method text,
ADD COLUMN IF NOT EXISTS launch_hosting_provider_name text,
ADD COLUMN IF NOT EXISTS launch_hosting_delegate_status text,
ADD COLUMN IF NOT EXISTS launch_self_launch_status text,
ADD COLUMN IF NOT EXISTS launch_wetransfer_link text;

-- Update the notifications type check constraint to include 4 new types
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
    'self_launch_link_request', 'self_launch_completed'
  )
);
