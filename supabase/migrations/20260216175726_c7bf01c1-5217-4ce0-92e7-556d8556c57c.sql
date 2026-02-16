-- Add columns to track who performed each action on a phase
ALTER TABLE public.project_phases
ADD COLUMN started_by uuid REFERENCES auth.users(id),
ADD COLUMN completed_by uuid REFERENCES auth.users(id),
ADD COLUMN submission_file_paths text,
ADD COLUMN submission_file_names text,
ADD COLUMN submission_comment text;

-- Add column to track who marked changes complete on a phase review
ALTER TABLE public.phase_reviews
ADD COLUMN change_completed_by uuid REFERENCES auth.users(id);