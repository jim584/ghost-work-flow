-- Create a security definer function to set user roles (bypasses RLS)
CREATE OR REPLACE FUNCTION public.set_user_role(role_name app_role)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_roles (user_id, role)
  VALUES (auth.uid(), role_name)
  ON CONFLICT (user_id, role) DO NOTHING;
END;
$$;