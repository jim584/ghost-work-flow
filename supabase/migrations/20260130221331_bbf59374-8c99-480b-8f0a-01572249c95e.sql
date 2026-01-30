-- Add website order specific columns to tasks table
ALTER TABLE public.tasks 
ADD COLUMN IF NOT EXISTS website_type text,
ADD COLUMN IF NOT EXISTS number_of_pages text,
ADD COLUMN IF NOT EXISTS website_features text,
ADD COLUMN IF NOT EXISTS content_provided boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS domain_hosting_status text,
ADD COLUMN IF NOT EXISTS design_references text,
ADD COLUMN IF NOT EXISTS website_deadline_type text;