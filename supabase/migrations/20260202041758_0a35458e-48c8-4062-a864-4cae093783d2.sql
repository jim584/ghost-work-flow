-- Allow PMs to view front_sales roles for tracking dropdowns
CREATE POLICY "PMs can view front sales roles"
ON public.user_roles
FOR SELECT
USING (
  has_role(auth.uid(), 'project_manager'::app_role) 
  AND role = 'front_sales'::app_role
);