
ALTER TABLE tasks 
  ADD COLUMN launch_nameserver_status text,
  ADD COLUMN launch_nameserver_1 text,
  ADD COLUMN launch_nameserver_2 text,
  ADD COLUMN launch_nameserver_3 text,
  ADD COLUMN launch_nameserver_4 text;

ALTER TABLE notifications 
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE notifications 
  ADD CONSTRAINT notifications_type_check 
  CHECK (type IN (
    'new_task', 'revision_requested', 'task_delayed', 'file_uploaded', 
    'order_cancelled', 'late_acknowledgement', 'reassignment_requested', 
    'order_message', 'website_launch', 'task_started',
    'nameserver_request', 'nameserver_ready', 'nameserver_confirmed'
  ));
