
-- Add superseded columns to phase_reviews
ALTER TABLE public.phase_reviews
  ADD COLUMN IF NOT EXISTS superseded_at timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS superseded_by uuid DEFAULT NULL;

-- Add UPDATE policy for PMs on phase_reviews (for superseding reviews and editing PM notes)
CREATE POLICY "PMs can update phase reviews for their tasks"
ON public.phase_reviews
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'project_manager'::app_role)
  AND task_id IN (SELECT id FROM tasks WHERE project_manager_id = auth.uid())
)
WITH CHECK (
  has_role(auth.uid(), 'project_manager'::app_role)
  AND task_id IN (SELECT id FROM tasks WHERE project_manager_id = auth.uid())
);

-- Add DELETE policy for PMs on phase_reviews (restricted to pm_note records they authored)
CREATE POLICY "PMs can delete own pm_note reviews"
ON public.phase_reviews
FOR DELETE
TO authenticated
USING (
  has_role(auth.uid(), 'project_manager'::app_role)
  AND reviewed_by = auth.uid()
  AND review_status = 'pm_note'
);
