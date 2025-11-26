-- Add DELETE policy for PMs to delete their own pending tasks
CREATE POLICY "PMs can delete their pending tasks"
ON public.tasks
FOR DELETE
TO authenticated
USING (
  has_role(auth.uid(), 'project_manager'::app_role) 
  AND project_manager_id = auth.uid()
  AND status = 'pending'::task_status
);