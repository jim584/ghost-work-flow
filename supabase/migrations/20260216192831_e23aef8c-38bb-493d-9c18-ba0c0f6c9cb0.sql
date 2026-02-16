-- Add columns for developer comments and files when marking changes complete
ALTER TABLE public.phase_reviews 
  ADD COLUMN IF NOT EXISTS change_comment text,
  ADD COLUMN IF NOT EXISTS change_file_paths text,
  ADD COLUMN IF NOT EXISTS change_file_names text;

-- Also add to project_phases for phase-level tracking
ALTER TABLE public.project_phases
  ADD COLUMN IF NOT EXISTS change_comment text,
  ADD COLUMN IF NOT EXISTS change_file_paths text,
  ADD COLUMN IF NOT EXISTS change_file_names text,
  ADD COLUMN IF NOT EXISTS change_completed_by uuid;