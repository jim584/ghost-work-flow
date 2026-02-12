
-- Add review columns to project_phases for the phase approval process
ALTER TABLE public.project_phases
  ADD COLUMN review_status text DEFAULT NULL,
  ADD COLUMN review_comment text DEFAULT NULL,
  ADD COLUMN reviewed_at timestamptz DEFAULT NULL,
  ADD COLUMN reviewed_by uuid DEFAULT NULL,
  ADD COLUMN change_severity text DEFAULT NULL,
  ADD COLUMN change_deadline timestamptz DEFAULT NULL,
  ADD COLUMN change_completed_at timestamptz DEFAULT NULL;

-- Add check constraint for review_status values
ALTER TABLE public.project_phases
  ADD CONSTRAINT project_phases_review_status_check
  CHECK (review_status IN ('approved', 'approved_with_changes', 'disapproved_with_changes') OR review_status IS NULL);

-- Add check constraint for change_severity values
ALTER TABLE public.project_phases
  ADD CONSTRAINT project_phases_change_severity_check
  CHECK (change_severity IN ('minor', 'average', 'major', 'major_major') OR change_severity IS NULL);

-- Add RLS policy for PMs to update project phases (needed for review submissions)
CREATE POLICY "PMs can update phases for their tasks"
  ON public.project_phases
  FOR UPDATE
  USING (
    has_role(auth.uid(), 'project_manager'::app_role)
    AND task_id IN (
      SELECT id FROM tasks WHERE project_manager_id = auth.uid()
    )
  )
  WITH CHECK (
    has_role(auth.uid(), 'project_manager'::app_role)
    AND task_id IN (
      SELECT id FROM tasks WHERE project_manager_id = auth.uid()
    )
  );
