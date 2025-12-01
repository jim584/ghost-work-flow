-- Enable pg_net extension for HTTP requests from database
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Update the create_task_notifications function to also send emails
CREATE OR REPLACE FUNCTION create_task_notifications()
RETURNS TRIGGER AS $$
DECLARE
  designer_record RECORD;
  service_role_key TEXT;
  supabase_url TEXT;
BEGIN
  -- Get service role key and URL from vault or use env
  service_role_key := current_setting('app.settings.service_role_key', true);
  supabase_url := current_setting('app.settings.supabase_url', true);
  
  -- Fallback to default service role from secrets
  IF service_role_key IS NULL THEN
    service_role_key := current_setting('supabase.service_role_key', true);
  END IF;
  
  IF supabase_url IS NULL THEN
    supabase_url := current_setting('supabase.url', true);
  END IF;

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
  -- Using pg_net to make async HTTP request
  IF supabase_url IS NOT NULL AND service_role_key IS NOT NULL THEN
    PERFORM net.http_post(
      url := supabase_url || '/functions/v1/send-task-notification',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || service_role_key
      ),
      body := jsonb_build_object(
        'taskId', NEW.id,
        'notificationType', 'new_task',
        'taskTitle', NEW.title
      )
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Update the create_revision_notifications function to also send emails
CREATE OR REPLACE FUNCTION create_revision_notifications()
RETURNS TRIGGER AS $$
DECLARE
  service_role_key TEXT;
  supabase_url TEXT;
  task_title TEXT;
BEGIN
  -- Only create notification if status changed to revision_requested
  IF NEW.revision_status = 'revision_requested' AND 
     (OLD.revision_status IS NULL OR OLD.revision_status != 'revision_requested') THEN
    
    -- Get service role key and URL
    service_role_key := current_setting('app.settings.service_role_key', true);
    supabase_url := current_setting('app.settings.supabase_url', true);
    
    IF service_role_key IS NULL THEN
      service_role_key := current_setting('supabase.service_role_key', true);
    END IF;
    
    IF supabase_url IS NULL THEN
      supabase_url := current_setting('supabase.url', true);
    END IF;
    
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
    IF supabase_url IS NOT NULL AND service_role_key IS NOT NULL THEN
      PERFORM net.http_post(
        url := supabase_url || '/functions/v1/send-task-notification',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || service_role_key
        ),
        body := jsonb_build_object(
          'taskId', NEW.task_id,
          'notificationType', 'revision_requested',
          'taskTitle', task_title,
          'revisionNotes', NEW.revision_notes
        )
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;