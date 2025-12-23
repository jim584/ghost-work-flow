-- Add designer_comment column to design_submissions table
ALTER TABLE public.design_submissions
ADD COLUMN designer_comment text;