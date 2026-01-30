-- Allow PMs to view all tasks (for cross-PM search functionality)
-- Drop the existing restrictive policy
DROP POLICY IF EXISTS "PMs can view their tasks" ON public.tasks;

-- Create new policy that allows PMs to view all tasks
CREATE POLICY "PMs can view all tasks"
ON public.tasks
FOR SELECT
USING (has_role(auth.uid(), 'project_manager'::app_role));