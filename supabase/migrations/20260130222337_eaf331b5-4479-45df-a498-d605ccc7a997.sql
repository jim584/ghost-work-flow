-- Create a table to track the last assigned developer index for round-robin
CREATE TABLE public.website_order_assignment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  last_assigned_index integer NOT NULL DEFAULT 0,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Insert initial row
INSERT INTO public.website_order_assignment (last_assigned_index) VALUES (0);

-- Enable RLS
ALTER TABLE public.website_order_assignment ENABLE ROW LEVEL SECURITY;

-- Only admins and PMs can read/update this table
CREATE POLICY "Admins and PMs can view assignment tracker"
ON public.website_order_assignment
FOR SELECT
USING (
  has_role(auth.uid(), 'admin'::app_role) 
  OR has_role(auth.uid(), 'project_manager'::app_role)
);

CREATE POLICY "Admins and PMs can update assignment tracker"
ON public.website_order_assignment
FOR UPDATE
USING (
  has_role(auth.uid(), 'admin'::app_role) 
  OR has_role(auth.uid(), 'project_manager'::app_role)
);

-- Create function to get the next developer team ID (round-robin)
CREATE OR REPLACE FUNCTION public.get_next_developer_team()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  developer_teams uuid[];
  current_index integer;
  next_index integer;
  next_team_id uuid;
BEGIN
  -- Get all developer team IDs (teams where the user has developer role)
  SELECT ARRAY(
    SELECT DISTINCT tm.team_id 
    FROM team_members tm
    JOIN user_roles ur ON ur.user_id = tm.user_id
    WHERE ur.role = 'developer'::app_role
    ORDER BY tm.team_id
  ) INTO developer_teams;
  
  -- If no developer teams exist, return NULL
  IF array_length(developer_teams, 1) IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Get current index
  SELECT last_assigned_index INTO current_index 
  FROM website_order_assignment 
  LIMIT 1;
  
  -- Calculate next index (wrap around if needed)
  next_index := current_index % array_length(developer_teams, 1);
  
  -- Get the team ID at this index (arrays are 1-indexed in PostgreSQL)
  next_team_id := developer_teams[next_index + 1];
  
  -- Update the index for next assignment
  UPDATE website_order_assignment 
  SET last_assigned_index = next_index + 1, updated_at = now();
  
  RETURN next_team_id;
END;
$$;