-- Critical Security Fix #1: Restrict profile access based on roles and team membership
-- Remove overly permissive policy
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;

-- Users can view their own profile
CREATE POLICY "Users can view own profile" ON public.profiles
FOR SELECT USING (auth.uid() = id);

-- Admins can view all profiles
CREATE POLICY "Admins can view all profiles" ON public.profiles
FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));

-- Project Managers can view all profiles
CREATE POLICY "PMs can view all profiles" ON public.profiles
FOR SELECT USING (has_role(auth.uid(), 'project_manager'::app_role));

-- Designers can view profiles of their team members only
CREATE POLICY "Designers can view team members profiles" ON public.profiles
FOR SELECT USING (
  has_role(auth.uid(), 'designer'::app_role) AND
  id IN (
    SELECT tm2.user_id FROM team_members tm1
    JOIN team_members tm2 ON tm1.team_id = tm2.team_id
    WHERE tm1.user_id = auth.uid()
  )
);

-- Critical Security Fix #2: Restrict notifications service role policy
-- Remove overly permissive policy that allows reading all notifications
DROP POLICY IF EXISTS "Service role can manage notifications" ON public.notifications;

-- Service role can only INSERT notifications (needed by database triggers)
CREATE POLICY "Service role can insert notifications" ON public.notifications
FOR INSERT WITH CHECK (true);