-- Allow PMs to insert replies for their tasks
CREATE POLICY "PMs can insert replies for their tasks"
ON public.phase_review_replies
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'project_manager'::app_role)
  AND user_id = auth.uid()
  AND task_id IN (SELECT id FROM tasks WHERE project_manager_id = auth.uid())
);