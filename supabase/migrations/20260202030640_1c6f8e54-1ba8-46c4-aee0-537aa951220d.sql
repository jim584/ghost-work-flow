-- Allow Front Sales to view other Front Sales roles for tracking dropdowns
CREATE POLICY "Front Sales can view front sales roles"
ON public.user_roles
FOR SELECT
USING (
  has_role(auth.uid(), 'front_sales'::app_role) 
  AND role = 'front_sales'::app_role
);