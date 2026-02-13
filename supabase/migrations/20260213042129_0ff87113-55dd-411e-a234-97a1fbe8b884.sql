-- Allow PMs and Front Sales to insert project phases (needed when creating website orders)
CREATE POLICY "PMs can insert phases for their tasks"
ON public.project_phases
FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'project_manager'::app_role) AND 
  task_id IN (SELECT id FROM tasks WHERE project_manager_id = auth.uid())
);

CREATE POLICY "Front Sales can insert project phases"
ON public.project_phases
FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'front_sales'::app_role) AND 
  task_id IN (SELECT id FROM tasks WHERE created_by = auth.uid())
);