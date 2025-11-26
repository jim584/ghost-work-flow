-- Update admin_set_user_role function to replace existing roles instead of adding
DROP FUNCTION IF EXISTS public.admin_set_user_role(uuid, app_role);

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
  
  -- Delete any existing roles for this user
  DELETE FROM public.user_roles WHERE user_id = target_user_id;
  
  -- Insert the new role
  INSERT INTO public.user_roles (user_id, role)
  VALUES (target_user_id, role_name);
END;
$$;