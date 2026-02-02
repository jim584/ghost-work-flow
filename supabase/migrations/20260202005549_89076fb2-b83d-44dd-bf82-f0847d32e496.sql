-- Add created_by column to track who created each task/order
ALTER TABLE public.tasks ADD COLUMN created_by uuid REFERENCES auth.users(id);

-- Update RLS policy for Front Sales to only see tasks they created
DROP POLICY IF EXISTS "Front Sales can view all tasks" ON public.tasks;
CREATE POLICY "Front Sales can view their own tasks"
ON public.tasks FOR SELECT
USING (has_role(auth.uid(), 'front_sales'::app_role) AND created_by = auth.uid());

-- Update insert policy to automatically set created_by
DROP POLICY IF EXISTS "Front Sales can create tasks" ON public.tasks;
CREATE POLICY "Front Sales can create tasks"
ON public.tasks FOR INSERT
WITH CHECK (has_role(auth.uid(), 'front_sales'::app_role) AND created_by = auth.uid());