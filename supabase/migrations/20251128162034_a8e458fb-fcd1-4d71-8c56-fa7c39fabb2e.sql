-- Allow designers to update their own submissions (specifically for marking as revised)
CREATE POLICY "Designers can update their own submissions"
ON public.design_submissions
FOR UPDATE
USING (
  has_role(auth.uid(), 'designer'::app_role) 
  AND designer_id = auth.uid()
)
WITH CHECK (
  has_role(auth.uid(), 'designer'::app_role) 
  AND designer_id = auth.uid()
);