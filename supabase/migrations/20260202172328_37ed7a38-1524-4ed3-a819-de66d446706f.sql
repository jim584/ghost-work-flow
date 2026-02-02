-- Add accepted_by_pm column to tasks table
ALTER TABLE public.tasks 
ADD COLUMN accepted_by_pm boolean NOT NULL DEFAULT false;