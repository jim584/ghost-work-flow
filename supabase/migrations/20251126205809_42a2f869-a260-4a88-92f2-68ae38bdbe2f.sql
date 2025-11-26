-- Allow PMs to update submissions for their tasks (for approvals and revision requests)
CREATE POLICY "PMs can update submissions for their tasks"
ON design_submissions
FOR UPDATE
USING (
  has_role(auth.uid(), 'project_manager'::app_role) 
  AND task_id IN (
    SELECT id FROM tasks WHERE project_manager_id = auth.uid()
  )
)
WITH CHECK (
  has_role(auth.uid(), 'project_manager'::app_role) 
  AND task_id IN (
    SELECT id FROM tasks WHERE project_manager_id = auth.uid()
  )
);