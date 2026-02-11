
-- Allow development_team_leader to view all tasks (same as admin)
CREATE POLICY "Dev team leaders can view all tasks"
ON public.tasks
FOR SELECT
USING (has_role(auth.uid(), 'development_team_leader'::app_role));

-- Allow development_team_leader to update tasks (for acknowledge, etc.)
CREATE POLICY "Dev team leaders can update tasks"
ON public.tasks
FOR UPDATE
USING (has_role(auth.uid(), 'development_team_leader'::app_role))
WITH CHECK (has_role(auth.uid(), 'development_team_leader'::app_role));

-- Allow development_team_leader to view all design_submissions
CREATE POLICY "Dev team leaders can view all submissions"
ON public.design_submissions
FOR SELECT
USING (has_role(auth.uid(), 'development_team_leader'::app_role));

-- Allow development_team_leader to create submissions
CREATE POLICY "Dev team leaders can create submissions"
ON public.design_submissions
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'development_team_leader'::app_role) AND designer_id = auth.uid());

-- Allow development_team_leader to update own submissions
CREATE POLICY "Dev team leaders can update own submissions"
ON public.design_submissions
FOR UPDATE
USING (has_role(auth.uid(), 'development_team_leader'::app_role) AND designer_id = auth.uid())
WITH CHECK (has_role(auth.uid(), 'development_team_leader'::app_role) AND designer_id = auth.uid());

-- Allow development_team_leader to view all project_phases
CREATE POLICY "Dev team leaders can view all phases"
ON public.project_phases
FOR SELECT
USING (has_role(auth.uid(), 'development_team_leader'::app_role));

-- Allow development_team_leader to update project_phases
CREATE POLICY "Dev team leaders can update phases"
ON public.project_phases
FOR UPDATE
USING (has_role(auth.uid(), 'development_team_leader'::app_role))
WITH CHECK (has_role(auth.uid(), 'development_team_leader'::app_role));

-- Allow development_team_leader to view developers
CREATE POLICY "Dev team leaders can view developers"
ON public.developers
FOR SELECT
USING (has_role(auth.uid(), 'development_team_leader'::app_role));

-- Allow development_team_leader to view calendars
CREATE POLICY "Dev team leaders can view calendars"
ON public.availability_calendars
FOR SELECT
USING (has_role(auth.uid(), 'development_team_leader'::app_role));

-- Allow development_team_leader to view leave records
CREATE POLICY "Dev team leaders can view leave records"
ON public.leave_records
FOR SELECT
USING (has_role(auth.uid(), 'development_team_leader'::app_role));

-- Allow development_team_leader to view all profiles
CREATE POLICY "Dev team leaders can view all profiles"
ON public.profiles
FOR SELECT
USING (has_role(auth.uid(), 'development_team_leader'::app_role));
