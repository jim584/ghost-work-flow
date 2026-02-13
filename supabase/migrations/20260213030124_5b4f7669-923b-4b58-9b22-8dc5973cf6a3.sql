
-- Remove email sending from create_task_notifications, keep in-app notifications
CREATE OR REPLACE FUNCTION public.create_task_notifications()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

-- Remove email sending from create_revision_notifications, keep in-app notifications
CREATE OR REPLACE FUNCTION public.create_revision_notifications()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  task_title TEXT;
BEGIN
  IF NEW.revision_status = 'needs_revision' AND 
     (OLD.revision_status IS NULL OR OLD.revision_status != 'needs_revision') THEN
    
    SELECT title INTO task_title FROM tasks WHERE id = NEW.task_id;
    
    INSERT INTO public.notifications (user_id, type, title, message, task_id)
    VALUES (
      NEW.designer_id,
      'revision_requested',
      'Revision Requested',
      COALESCE(NEW.revision_notes, 'Please check the task details'),
      NEW.task_id
    );
  END IF;
  
  RETURN NEW;
END;
$function$;
