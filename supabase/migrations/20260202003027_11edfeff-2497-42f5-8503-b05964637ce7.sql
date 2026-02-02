-- Allow Front Sales to view project_manager roles
CREATE POLICY "Front Sales can view project manager roles"
ON public.user_roles
FOR SELECT
USING (
  has_role(auth.uid(), 'front_sales'::app_role) 
  AND role = 'project_manager'::app_role
);