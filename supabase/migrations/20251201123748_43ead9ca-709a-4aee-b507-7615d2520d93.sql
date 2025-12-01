-- Create function to automatically create notifications for revision requests
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for revision requests
DROP TRIGGER IF EXISTS trigger_create_revision_notifications ON design_submissions;
CREATE TRIGGER trigger_create_revision_notifications
AFTER UPDATE ON design_submissions
FOR EACH ROW
EXECUTE FUNCTION create_revision_notifications();