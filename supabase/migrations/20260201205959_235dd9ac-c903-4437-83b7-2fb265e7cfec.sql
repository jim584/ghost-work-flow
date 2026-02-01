-- Allow PMs to view designer and developer roles for team assignment
CREATE POLICY "PMs can view designer and developer roles"
ON public.user_roles
FOR SELECT
USING (
  has_role(auth.uid(), 'project_manager'::app_role) 
  AND role IN ('designer'::app_role, 'developer'::app_role)
);