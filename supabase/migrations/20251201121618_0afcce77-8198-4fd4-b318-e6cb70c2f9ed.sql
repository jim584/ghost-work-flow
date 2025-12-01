-- Enable realtime for tasks table
ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks;

-- Enable realtime for design_submissions table
ALTER PUBLICATION supabase_realtime ADD TABLE public.design_submissions;