
-- Add pages_completed and points columns to project_phases
ALTER TABLE public.project_phases 
  ADD COLUMN pages_completed integer NOT NULL DEFAULT 3,
  ADD COLUMN points integer NOT NULL DEFAULT 3;

-- Add constraint: pages_completed and points must be between 1 and 3
ALTER TABLE public.project_phases 
  ADD CONSTRAINT project_phases_pages_completed_check CHECK (pages_completed >= 1 AND pages_completed <= 3),
  ADD CONSTRAINT project_phases_points_check CHECK (points >= 1 AND points <= 3);
