
-- Create a table to store multiple review rounds per phase
CREATE TABLE public.phase_reviews (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  phase_id UUID NOT NULL REFERENCES public.project_phases(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  review_status TEXT NOT NULL, -- 'approved', 'approved_with_changes', 'disapproved_with_changes'
  review_comment TEXT,
  change_severity TEXT,
  review_voice_path TEXT,
  review_file_paths TEXT,
  review_file_names TEXT,
  reviewed_by UUID NOT NULL,
  reviewed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  change_deadline TIMESTAMP WITH TIME ZONE,
  change_completed_at TIMESTAMP WITH TIME ZONE,
  round_number INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.phase_reviews ENABLE ROW LEVEL SECURITY;

-- RLS policies matching project_phases access patterns
CREATE POLICY "Admins can manage phase reviews"
  ON public.phase_reviews FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "PMs can view all phase reviews"
  ON public.phase_reviews FOR SELECT
  USING (has_role(auth.uid(), 'project_manager'::app_role));

CREATE POLICY "PMs can insert phase reviews for their tasks"
  ON public.phase_reviews FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'project_manager'::app_role) AND task_id IN (
    SELECT id FROM tasks WHERE project_manager_id = auth.uid()
  ));

CREATE POLICY "Dev team leaders can view all phase reviews"
  ON public.phase_reviews FOR SELECT
  USING (has_role(auth.uid(), 'development_team_leader'::app_role));

CREATE POLICY "Developers can view own team phase reviews"
  ON public.phase_reviews FOR SELECT
  USING (has_role(auth.uid(), 'developer'::app_role) AND task_id IN (
    SELECT id FROM tasks WHERE team_id IN (
      SELECT team_id FROM team_members WHERE user_id = auth.uid()
    )
  ));

CREATE POLICY "Front Sales can view phase reviews"
  ON public.phase_reviews FOR SELECT
  USING (has_role(auth.uid(), 'front_sales'::app_role));

-- Migrate existing review data from project_phases into phase_reviews
INSERT INTO public.phase_reviews (
  phase_id, task_id, review_status, review_comment, change_severity,
  review_voice_path, review_file_paths, review_file_names,
  reviewed_by, reviewed_at, change_deadline, change_completed_at, round_number
)
SELECT
  pp.id, pp.task_id, pp.review_status, pp.review_comment, pp.change_severity,
  pp.review_voice_path, pp.review_file_paths, pp.review_file_names,
  pp.reviewed_by, pp.reviewed_at, pp.change_deadline, pp.change_completed_at, 1
FROM public.project_phases pp
WHERE pp.review_status IS NOT NULL AND pp.reviewed_by IS NOT NULL;

-- Index for fast lookups
CREATE INDEX idx_phase_reviews_phase_id ON public.phase_reviews(phase_id);
CREATE INDEX idx_phase_reviews_task_id ON public.phase_reviews(task_id);
