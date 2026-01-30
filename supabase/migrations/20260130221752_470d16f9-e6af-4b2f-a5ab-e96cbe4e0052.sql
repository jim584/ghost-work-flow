-- Create RLS policy for developers to view website tasks for their teams
CREATE POLICY "Developers can view tasks for their teams" 
ON public.tasks 
FOR SELECT 
USING (
  has_role(auth.uid(), 'developer'::app_role) 
  AND team_id IN (
    SELECT team_id FROM team_members WHERE user_id = auth.uid()
  )
);

-- Create RLS policy for developers to update task status
CREATE POLICY "Developers can update task status" 
ON public.tasks 
FOR UPDATE 
USING (
  has_role(auth.uid(), 'developer'::app_role) 
  AND team_id IN (
    SELECT team_id FROM team_members WHERE user_id = auth.uid()
  )
)
WITH CHECK (
  has_role(auth.uid(), 'developer'::app_role) 
  AND team_id IN (
    SELECT team_members.team_id FROM team_members WHERE user_id = auth.uid()
  )
);

-- Create RLS policies for developers on design_submissions
CREATE POLICY "Developers can create submissions" 
ON public.design_submissions 
FOR INSERT 
WITH CHECK (
  has_role(auth.uid(), 'developer'::app_role) 
  AND designer_id = auth.uid()
);

CREATE POLICY "Developers can view their own submissions" 
ON public.design_submissions 
FOR SELECT 
USING (
  has_role(auth.uid(), 'developer'::app_role) 
  AND designer_id = auth.uid()
);

CREATE POLICY "Developers can update their own submissions" 
ON public.design_submissions 
FOR UPDATE 
USING (
  has_role(auth.uid(), 'developer'::app_role) 
  AND designer_id = auth.uid()
)
WITH CHECK (
  has_role(auth.uid(), 'developer'::app_role) 
  AND designer_id = auth.uid()
);

-- Create RLS policy for developers to view profiles (team members only)
CREATE POLICY "Developers can view team members profiles" 
ON public.profiles 
FOR SELECT 
USING (
  has_role(auth.uid(), 'developer'::app_role) 
  AND id IN (
    SELECT tm2.user_id 
    FROM team_members tm1
    JOIN team_members tm2 ON tm1.team_id = tm2.team_id
    WHERE tm1.user_id = auth.uid()
  )
);

-- Update create_designer_team function to also create teams for developers
CREATE OR REPLACE FUNCTION public.create_designer_team()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  display_name TEXT;
  new_team_id UUID;
BEGIN
  -- Only proceed if the role is designer or developer
  IF NEW.role IN ('designer'::app_role, 'developer'::app_role) THEN
    -- Get the user's team name, full name, or email (in that order of preference)
    SELECT COALESCE(team_name, full_name, email) INTO display_name
    FROM public.profiles
    WHERE id = NEW.user_id;
    
    -- Create a new team for this user
    INSERT INTO public.teams (name, description)
    VALUES (
      display_name,
      CASE 
        WHEN NEW.role = 'developer'::app_role THEN 'Personal team for developer'
        ELSE 'Personal team for designer'
      END
    )
    RETURNING id INTO new_team_id;
    
    -- Add the user to their team
    INSERT INTO public.team_members (team_id, user_id)
    VALUES (new_team_id, NEW.user_id);
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Create a function for users to self-assign developer role (similar to designer)
CREATE OR REPLACE FUNCTION public.set_user_role_developer()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.user_roles (user_id, role)
  VALUES (auth.uid(), 'developer'::app_role)
  ON CONFLICT (user_id, role) DO NOTHING;
END;
$$;

-- Update the insert policy for user_roles to allow self-assigning developer role
DROP POLICY IF EXISTS "Users can insert designer role only" ON public.user_roles;

CREATE POLICY "Users can insert designer or developer role only" 
ON public.user_roles 
FOR INSERT 
WITH CHECK (
  auth.uid() = user_id 
  AND role IN ('designer'::app_role, 'developer'::app_role)
);