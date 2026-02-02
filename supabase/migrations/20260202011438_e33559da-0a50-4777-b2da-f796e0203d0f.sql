-- Update RLS policy to allow Front Sales to view all tasks (for search functionality)
-- They can search and view status of all orders, but their dashboard still shows their own orders
DROP POLICY IF EXISTS "Front Sales can view their own tasks" ON public.tasks;

CREATE POLICY "Front Sales can view all tasks"
ON public.tasks FOR SELECT
USING (has_role(auth.uid(), 'front_sales'::app_role));