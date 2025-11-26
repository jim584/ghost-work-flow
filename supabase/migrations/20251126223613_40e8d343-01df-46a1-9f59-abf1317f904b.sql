-- Add team_name column to profiles table
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS team_name TEXT;

-- Update the trigger function to use team_name if available
CREATE OR REPLACE FUNCTION public.create_designer_team()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  designer_display_name TEXT;
  new_team_id UUID;
BEGIN
  -- Only proceed if the role is designer
  IF NEW.role = 'designer'::app_role THEN
    -- Get the designer's team name, full name, or email (in that order of preference)
    SELECT COALESCE(team_name, full_name, email) INTO designer_display_name
    FROM public.profiles
    WHERE id = NEW.user_id;
    
    -- Create a new team for this designer
    INSERT INTO public.teams (name, description)
    VALUES (
      designer_display_name,
      'Personal team for designer'
    )
    RETURNING id INTO new_team_id;
    
    -- Add the designer to their team
    INSERT INTO public.team_members (team_id, user_id)
    VALUES (new_team_id, NEW.user_id);
  END IF;
  
  RETURN NEW;
END;
$$;