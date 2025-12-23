-- Create trigger for new task notifications
CREATE TRIGGER on_task_created
  AFTER INSERT ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.create_task_notifications();

-- Create trigger for revision request notifications  
CREATE TRIGGER on_revision_requested
  AFTER UPDATE ON public.design_submissions
  FOR EACH ROW
  EXECUTE FUNCTION public.create_revision_notifications();