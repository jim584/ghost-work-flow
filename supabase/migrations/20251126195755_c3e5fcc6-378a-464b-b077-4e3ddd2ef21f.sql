-- Allow designers to update task status for tasks assigned to their teams
CREATE POLICY "Designers can update task status"
ON public.tasks
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'designer'::app_role) 
  AND team_id IN (
    SELECT team_id 
    FROM public.team_members 
    WHERE user_id = auth.uid()
  )
)
WITH CHECK (
  has_role(auth.uid(), 'designer'::app_role) 
  AND team_id IN (
    SELECT team_id 
    FROM public.team_members 
    WHERE user_id = auth.uid()
  )
);