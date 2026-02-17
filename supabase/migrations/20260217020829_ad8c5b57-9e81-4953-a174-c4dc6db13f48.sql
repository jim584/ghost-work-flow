
-- Add hold-related columns to project_phases
ALTER TABLE public.project_phases
  ADD COLUMN hold_reason text,
  ADD COLUMN held_at timestamptz,
  ADD COLUMN held_by uuid;
