ALTER TABLE notifications DROP CONSTRAINT notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check 
  CHECK (type IN ('new_task', 'revision_requested', 'task_delayed', 'file_uploaded', 
                  'order_cancelled', 'late_acknowledgement', 'reassignment_requested', 
                  'order_message', 'website_launch'));