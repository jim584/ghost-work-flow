-- Update the create_task_notifications function with hardcoded service values
CREATE OR REPLACE FUNCTION create_task_notifications()
RETURNS TRIGGER AS $$
DECLARE
  designer_record RECORD;
  request_id bigint;
BEGIN
  -- For each designer in the team, create a notification
  FOR designer_record IN 
    SELECT DISTINCT tm.user_id
    FROM team_members tm
    JOIN user_roles ur ON ur.user_id = tm.user_id
    WHERE tm.team_id = NEW.team_id
    AND ur.role = 'designer'
  LOOP
    -- Create in-app notification
    INSERT INTO public.notifications (user_id, type, title, message, task_id)
    VALUES (
      designer_record.user_id,
      'new_task',
      'New Task Assigned',
      'Task: ' || NEW.title,
      NEW.id
    );
  END LOOP;
  
  -- Send email notification via edge function (fire and forget)
  SELECT net.http_post(
    url := 'https://vxiipdlmkhcmkliygoyg.supabase.co/functions/v1/send-task-notification',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ4aWlwZGxta2hjbWtsaXlnb3lnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDE4MTIwNSwiZXhwIjoyMDc5NzU3MjA1fQ.zQ9XFznJuLKd5BL6Cj8Y-NaYZ-_FzJ0D7OQzZOQfJ9o"}'::jsonb,
    body := jsonb_build_object(
      'taskId', NEW.id,
      'notificationType', 'new_task',
      'taskTitle', NEW.title
    )
  ) INTO request_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Update the create_revision_notifications function with hardcoded service values
CREATE OR REPLACE FUNCTION create_revision_notifications()
RETURNS TRIGGER AS $$
DECLARE
  task_title TEXT;
  request_id bigint;
BEGIN
  -- Only create notification if status changed to revision_requested
  IF NEW.revision_status = 'revision_requested' AND 
     (OLD.revision_status IS NULL OR OLD.revision_status != 'revision_requested') THEN
    
    -- Get task title
    SELECT title INTO task_title FROM tasks WHERE id = NEW.task_id;
    
    -- Create in-app notification
    INSERT INTO public.notifications (user_id, type, title, message, task_id)
    VALUES (
      NEW.designer_id,
      'revision_requested',
      'Revision Requested',
      COALESCE(NEW.revision_notes, 'Please check the task details'),
      NEW.task_id
    );
    
    -- Send email notification via edge function (fire and forget)
    SELECT net.http_post(
      url := 'https://vxiipdlmkhcmkliygoyg.supabase.co/functions/v1/send-task-notification',
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ4aWlwZGxta2hjbWtsaXlnb3lnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDE4MTIwNSwiZXhwIjoyMDc5NzU3MjA1fQ.zQ9XFznJuLKd5BL6Cj8Y-NaYZ-_FzJ0D7OQzZOQfJ9o"}'::jsonb,
      body := jsonb_build_object(
        'taskId', NEW.task_id,
        'notificationType', 'revision_requested',
        'taskTitle', task_title,
        'revisionNotes', NEW.revision_notes
      )
    ) INTO request_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;