-- Function to create individual team for designer
CREATE OR REPLACE FUNCTION public.create_designer_team()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  designer_name TEXT;
  new_team_id UUID;
BEGIN
  -- Only proceed if the role is designer
  IF NEW.role = 'designer'::app_role THEN
    -- Get the designer's name or email
    SELECT COALESCE(full_name, email) INTO designer_name
    FROM public.profiles
    WHERE id = NEW.user_id;
    
    -- Create a new team for this designer
    INSERT INTO public.teams (name, description)
    VALUES (
      designer_name || '''s Team',
      'Personal team for ' || designer_name
    )
    RETURNING id INTO new_team_id;
    
    -- Add the designer to their team
    INSERT INTO public.team_members (team_id, user_id)
    VALUES (new_team_id, NEW.user_id);
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger to auto-create team when designer role is assigned
DROP TRIGGER IF EXISTS on_designer_role_assigned ON public.user_roles;
CREATE TRIGGER on_designer_role_assigned
  AFTER INSERT ON public.user_roles
  FOR EACH ROW
  EXECUTE FUNCTION public.create_designer_team();