-- Create function to automatically create notifications for new tasks
CREATE OR REPLACE FUNCTION create_task_notifications()
RETURNS TRIGGER AS $$
DECLARE
  designer_record RECORD;
BEGIN
  -- For each designer in the team, create a notification
  FOR designer_record IN 
    SELECT DISTINCT tm.user_id
    FROM team_members tm
    JOIN user_roles ur ON ur.user_id = tm.user_id
    WHERE tm.team_id = NEW.team_id
    AND ur.role = 'designer'
  LOOP
    INSERT INTO public.notifications (user_id, type, title, message, task_id)
    VALUES (
      designer_record.user_id,
      'new_task',
      'New Task Assigned',
      'Task: ' || NEW.title,
      NEW.id
    );
  END LOOP;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to fire after task insert
DROP TRIGGER IF EXISTS trigger_create_task_notifications ON tasks;
CREATE TRIGGER trigger_create_task_notifications
AFTER INSERT ON tasks
FOR EACH ROW
EXECUTE FUNCTION create_task_notifications();

-- Manually create notification for task #21 that was just created
INSERT INTO public.notifications (user_id, type, title, message, task_id)
SELECT 
  tm.user_id,
  'new_task',
  'New Task Assigned',
  'Task: ' || t.title,
  t.id
FROM tasks t
JOIN team_members tm ON tm.team_id = t.team_id
JOIN user_roles ur ON ur.user_id = tm.user_id
WHERE t.task_number = 21
AND ur.role = 'designer'
ON CONFLICT DO NOTHING;