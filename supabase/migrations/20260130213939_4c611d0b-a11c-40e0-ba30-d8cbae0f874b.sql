-- Allow admins to approve/request revisions on any design submission
-- (Admin dashboard currently calls UPDATE on public.design_submissions but admins don't have an UPDATE policy.)

CREATE POLICY "Admins can update all submissions"
ON public.design_submissions
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
