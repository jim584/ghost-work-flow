
-- Revert: PMs should only see submissions for tasks they are assigned to
DROP POLICY "PMs can view submissions for their tasks" ON public.design_submissions;

CREATE POLICY "PMs can view submissions for their tasks"
ON public.design_submissions
FOR SELECT
USING (
  has_role(auth.uid(), 'project_manager'::app_role) AND (
    task_id IN (
      SELECT tasks.id FROM tasks
      WHERE tasks.project_manager_id = auth.uid()
    )
  )
);
