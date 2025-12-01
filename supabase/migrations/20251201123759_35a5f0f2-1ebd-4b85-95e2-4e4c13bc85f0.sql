-- Fix security issue: Set search_path for functions
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION create_revision_notifications()
RETURNS TRIGGER AS $$
BEGIN
  -- Only create notification if status changed to revision_requested
  IF NEW.revision_status = 'revision_requested' AND 
     (OLD.revision_status IS NULL OR OLD.revision_status != 'revision_requested') THEN
    
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;