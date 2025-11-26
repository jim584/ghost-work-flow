-- Add revision tracking columns to design_submissions
ALTER TABLE design_submissions
ADD COLUMN revision_status text DEFAULT 'pending_review' CHECK (revision_status IN ('pending_review', 'approved', 'needs_revision')),
ADD COLUMN revision_notes text,
ADD COLUMN reviewed_at timestamp with time zone,
ADD COLUMN reviewed_by uuid REFERENCES auth.users(id);

-- Create index for faster queries
CREATE INDEX idx_design_submissions_revision_status ON design_submissions(revision_status);
CREATE INDEX idx_design_submissions_task_id ON design_submissions(task_id);