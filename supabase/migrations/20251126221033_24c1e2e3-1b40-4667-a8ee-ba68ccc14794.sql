-- Add new columns for logo orders to tasks table
ALTER TABLE public.tasks 
ADD COLUMN IF NOT EXISTS logo_type text,
ADD COLUMN IF NOT EXISTS logo_style text,
ADD COLUMN IF NOT EXISTS tagline text,
ADD COLUMN IF NOT EXISTS number_of_concepts text,
ADD COLUMN IF NOT EXISTS number_of_revisions text,
ADD COLUMN IF NOT EXISTS file_formats_needed text,
ADD COLUMN IF NOT EXISTS usage_type text,
ADD COLUMN IF NOT EXISTS competitors_inspiration text;