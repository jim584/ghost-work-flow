-- Allow PMs to view other project manager roles (for the PM dropdown in order forms)
CREATE POLICY "PMs can view project manager roles"
ON public.user_roles
FOR SELECT
USING (
  has_role(auth.uid(), 'project_manager'::app_role) 
  AND role = 'project_manager'::app_role
);