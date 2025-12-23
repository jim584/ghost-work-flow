-- Drop and recreate the create_task_notifications function with correct URL and better error handling
CREATE OR REPLACE FUNCTION public.create_task_notifications()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  
  -- Send email notification via edge function
  BEGIN
    SELECT net.http_post(
      url := 'https://vxiipdlmkhcmkliygoyg.functions.supabase.co/send-task-notification',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ4aWlwZGxta2hjbWtsaXlnb3lnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQxODEyMDUsImV4cCI6MjA3OTc1NzIwNX0.eF9aym6cxRfY-TZAwMHW9tlhSurzKLAGkk4A_ARrPpc'
      ),
      body := jsonb_build_object(
        'taskId', NEW.id,
        'notificationType', 'new_task',
        'taskTitle', NEW.title
      ),
      timeout_milliseconds := 30000
    ) INTO request_id;
  EXCEPTION WHEN OTHERS THEN
    RAISE LOG 'Error sending task notification email: %', SQLERRM;
  END;
  
  RETURN NEW;
END;
$function$;

-- Drop and recreate the create_revision_notifications function with correct URL and better error handling
CREATE OR REPLACE FUNCTION public.create_revision_notifications()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  task_title TEXT;
  request_id bigint;
BEGIN
  -- Only create notification if status changed to needs_revision
  IF NEW.revision_status = 'needs_revision' AND 
     (OLD.revision_status IS NULL OR OLD.revision_status != 'needs_revision') THEN
    
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
    
    -- Send email notification via edge function
    BEGIN
      SELECT net.http_post(
        url := 'https://vxiipdlmkhcmkliygoyg.functions.supabase.co/send-task-notification',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ4aWlwZGxta2hjbWtsaXlnb3lnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQxODEyMDUsImV4cCI6MjA3OTc1NzIwNX0.eF9aym6cxRfY-TZAwMHW9tlhSurzKLAGkk4A_ARrPpc'
        ),
        body := jsonb_build_object(
          'taskId', NEW.task_id,
          'notificationType', 'revision_requested',
          'taskTitle', task_title,
          'revisionNotes', NEW.revision_notes
        ),
        timeout_milliseconds := 30000
      ) INTO request_id;
    EXCEPTION WHEN OTHERS THEN
      RAISE LOG 'Error sending revision notification email: %', SQLERRM;
    END;
  END IF;
  
  RETURN NEW;
END;
$function$;