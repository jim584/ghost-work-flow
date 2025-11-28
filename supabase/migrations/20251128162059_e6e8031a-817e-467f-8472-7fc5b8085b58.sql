-- Drop the existing check constraint on revision_status
ALTER TABLE public.design_submissions 
DROP CONSTRAINT IF EXISTS design_submissions_revision_status_check;

-- Add new check constraint with 'revised' status
ALTER TABLE public.design_submissions
ADD CONSTRAINT design_submissions_revision_status_check 
CHECK (revision_status IN ('pending_review', 'approved', 'needs_revision', 'revised'));