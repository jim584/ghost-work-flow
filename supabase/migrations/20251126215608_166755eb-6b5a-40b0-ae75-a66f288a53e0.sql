-- Remove the old set_user_role function that allowed any role
DROP FUNCTION IF EXISTS public.set_user_role(app_role);

-- Create new function that only allows designer role for self-signup
CREATE OR REPLACE FUNCTION public.set_user_role_designer()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  INSERT INTO public.user_roles (user_id, role)
  VALUES (auth.uid(), 'designer'::app_role)
  ON CONFLICT (user_id, role) DO NOTHING;
END;
$$;

-- Create admin-only function to assign roles to users
CREATE OR REPLACE FUNCTION public.admin_set_user_role(target_user_id uuid, role_name app_role)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- Check if the caller is an admin
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can assign roles';
  END IF;
  
  INSERT INTO public.user_roles (user_id, role)
  VALUES (target_user_id, role_name)
  ON CONFLICT (user_id, role) DO NOTHING;
END;
$$;

-- Update RLS policy to prevent users from inserting admin/PM roles themselves
DROP POLICY IF EXISTS "Users can insert their own role" ON public.user_roles;

CREATE POLICY "Users can insert designer role only"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id 
  AND role = 'designer'::app_role
);