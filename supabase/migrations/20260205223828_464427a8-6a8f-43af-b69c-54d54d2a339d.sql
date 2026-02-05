-- Drop the existing restrictive PM INSERT policy
DROP POLICY IF EXISTS "PMs can create tasks" ON public.tasks;

-- Create a new policy that allows PMs to create tasks for any PM
-- (matching Front Sales behavior - check created_by instead of project_manager_id)
CREATE POLICY "PMs can create tasks"
  ON public.tasks
  FOR INSERT
  TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'project_manager'::app_role) 
    AND created_by = auth.uid()
  );