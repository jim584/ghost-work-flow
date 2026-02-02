-- Drop the existing policy
DROP POLICY IF EXISTS "PMs can update their tasks" ON public.tasks;

-- Create updated policy with reassignment support
CREATE POLICY "PMs can update their tasks"
ON public.tasks
FOR UPDATE
USING (
  has_role(auth.uid(), 'project_manager'::app_role) 
  AND project_manager_id = auth.uid()
)
WITH CHECK (
  has_role(auth.uid(), 'project_manager'::app_role) 
  AND (
    -- Regular updates: PM keeps ownership
    project_manager_id = auth.uid()
    OR
    -- Reassignment: Only allowed when status is pending
    (
      status = 'pending'::task_status
      AND reassigned_from = auth.uid() 
      AND reassigned_at IS NOT NULL
    )
  )
);