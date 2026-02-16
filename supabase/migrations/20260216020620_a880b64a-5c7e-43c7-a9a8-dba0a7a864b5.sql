-- Allow developers to update change_completed_at on phase_reviews for their team's tasks
CREATE POLICY "Developers can update own team phase reviews"
ON public.phase_reviews
FOR UPDATE
USING (
  has_role(auth.uid(), 'developer'::app_role) AND 
  task_id IN (
    SELECT tasks.id FROM tasks 
    WHERE tasks.team_id IN (
      SELECT team_members.team_id FROM team_members WHERE team_members.user_id = auth.uid()
    )
  )
)
WITH CHECK (
  has_role(auth.uid(), 'developer'::app_role) AND 
  task_id IN (
    SELECT tasks.id FROM tasks 
    WHERE tasks.team_id IN (
      SELECT team_members.team_id FROM team_members WHERE team_members.user_id = auth.uid()
    )
  )
);

-- Allow dev team leaders to update phase reviews
CREATE POLICY "Dev team leaders can update phase reviews"
ON public.phase_reviews
FOR UPDATE
USING (has_role(auth.uid(), 'development_team_leader'::app_role))
WITH CHECK (has_role(auth.uid(), 'development_team_leader'::app_role));