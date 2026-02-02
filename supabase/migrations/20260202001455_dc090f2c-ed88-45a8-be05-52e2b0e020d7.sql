-- Create function to allow users to set their role to front_sales during signup
CREATE OR REPLACE FUNCTION public.set_user_role_front_sales()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_roles (user_id, role)
  VALUES (auth.uid(), 'front_sales');
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.set_user_role_front_sales() TO authenticated;

-- RLS policy: Front Sales can view all tasks (like PMs)
CREATE POLICY "Front Sales can view all tasks"
ON public.tasks
FOR SELECT
USING (has_role(auth.uid(), 'front_sales'::app_role));

-- RLS policy: Front Sales can create tasks
CREATE POLICY "Front Sales can create tasks"
ON public.tasks
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'front_sales'::app_role) AND project_manager_id = auth.uid());

-- RLS policy: Front Sales can update their tasks
CREATE POLICY "Front Sales can update their tasks"
ON public.tasks
FOR UPDATE
USING (has_role(auth.uid(), 'front_sales'::app_role) AND project_manager_id = auth.uid());

-- RLS policy: Front Sales can delete their pending tasks
CREATE POLICY "Front Sales can delete their pending tasks"
ON public.tasks
FOR DELETE
USING (has_role(auth.uid(), 'front_sales'::app_role) AND project_manager_id = auth.uid() AND status = 'pending'::task_status);

-- RLS policy: Front Sales can view all profiles (for team selection)
CREATE POLICY "Front Sales can view all profiles"
ON public.profiles
FOR SELECT
USING (has_role(auth.uid(), 'front_sales'::app_role));

-- RLS policy: Front Sales can view designer and developer roles (for team filtering)
CREATE POLICY "Front Sales can view designer and developer roles"
ON public.user_roles
FOR SELECT
USING (has_role(auth.uid(), 'front_sales'::app_role) AND role IN ('designer'::app_role, 'developer'::app_role));

-- RLS policy: Front Sales can view assignment tracker
CREATE POLICY "Front Sales can view assignment tracker"
ON public.website_order_assignment
FOR SELECT
USING (has_role(auth.uid(), 'front_sales'::app_role));

-- RLS policy: Front Sales can update assignment tracker
CREATE POLICY "Front Sales can update assignment tracker"
ON public.website_order_assignment
FOR UPDATE
USING (has_role(auth.uid(), 'front_sales'::app_role));

-- RLS policy: Front Sales can view delay notifications
CREATE POLICY "Front Sales can view delay notifications"
ON public.task_delay_notifications
FOR SELECT
USING (has_role(auth.uid(), 'front_sales'::app_role));