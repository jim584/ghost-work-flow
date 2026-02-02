-- Add columns to track reassignment
ALTER TABLE public.tasks 
ADD COLUMN reassignment_reason text,
ADD COLUMN reassigned_from uuid,
ADD COLUMN reassigned_at timestamp with time zone;