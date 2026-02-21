-- Allow developers to update replies for their team tasks (to set dev_read_at)
CREATE POLICY "Developers can update replies for team tasks"
ON public.phase_review_replies
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'developer'::app_role)
  AND task_id IN (SELECT id FROM tasks WHERE team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()))
)
WITH CHECK (
  has_role(auth.uid(), 'developer'::app_role)
  AND task_id IN (SELECT id FROM tasks WHERE team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()))
);