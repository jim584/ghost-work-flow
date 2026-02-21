-- Add pm_read_at column to phase_review_replies
ALTER TABLE phase_review_replies ADD COLUMN pm_read_at timestamptz DEFAULT NULL;

-- Allow PMs to update phase_review_replies for their tasks (to set pm_read_at)
CREATE POLICY "PMs can update replies for their tasks"
ON public.phase_review_replies
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'project_manager'::app_role)
  AND task_id IN (SELECT id FROM tasks WHERE project_manager_id = auth.uid())
)
WITH CHECK (
  has_role(auth.uid(), 'project_manager'::app_role)
  AND task_id IN (SELECT id FROM tasks WHERE project_manager_id = auth.uid())
);