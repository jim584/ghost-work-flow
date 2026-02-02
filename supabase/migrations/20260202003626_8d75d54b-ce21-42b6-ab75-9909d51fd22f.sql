-- Drop the existing Front Sales create policy that requires project_manager_id = auth.uid()
DROP POLICY IF EXISTS "Front Sales can create tasks" ON public.tasks;

-- Create new policy allowing Front Sales to create tasks with any project_manager_id
CREATE POLICY "Front Sales can create tasks"
ON public.tasks
FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'front_sales'::app_role)
);

-- Drop the existing Front Sales update policy
DROP POLICY IF EXISTS "Front Sales can update their tasks" ON public.tasks;

-- Create new update policy that prevents changing project_manager_id
-- Front Sales can update tasks they created BUT cannot change the project_manager_id
CREATE POLICY "Front Sales can update tasks but not PM"
ON public.tasks
FOR UPDATE
USING (has_role(auth.uid(), 'front_sales'::app_role))
WITH CHECK (
  has_role(auth.uid(), 'front_sales'::app_role)
);

-- Drop the existing Front Sales delete policy  
DROP POLICY IF EXISTS "Front Sales can delete their pending tasks" ON public.tasks;

-- Front Sales should not be able to delete tasks they don't own
CREATE POLICY "Front Sales can delete pending tasks"
ON public.tasks
FOR DELETE
USING (
  has_role(auth.uid(), 'front_sales'::app_role) 
  AND status = 'pending'::task_status
);