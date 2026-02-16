
-- Allow developers to insert phases for their team's tasks
CREATE POLICY "Developers can insert phases for team tasks"
ON public.project_phases
FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'developer'::app_role) 
  AND task_id IN (
    SELECT t.id FROM tasks t 
    WHERE t.team_id IN (
      SELECT tm.team_id FROM team_members tm WHERE tm.user_id = auth.uid()
    )
  )
);

-- Allow dev team leaders to insert phases
CREATE POLICY "Dev team leaders can insert phases"
ON public.project_phases
FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'development_team_leader'::app_role)
);
