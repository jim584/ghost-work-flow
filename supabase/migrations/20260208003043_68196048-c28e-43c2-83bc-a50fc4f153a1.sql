
-- Add parent_submission_id to link revision uploads to the original submission
ALTER TABLE public.design_submissions
ADD COLUMN parent_submission_id uuid REFERENCES public.design_submissions(id);

-- Index for efficient lookups
CREATE INDEX idx_design_submissions_parent ON public.design_submissions(parent_submission_id);
