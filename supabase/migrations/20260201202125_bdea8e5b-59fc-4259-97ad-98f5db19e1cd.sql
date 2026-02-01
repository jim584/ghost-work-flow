-- Add missing columns for website orders
ALTER TABLE public.tasks 
ADD COLUMN IF NOT EXISTS business_email text,
ADD COLUMN IF NOT EXISTS business_phone text,
ADD COLUMN IF NOT EXISTS video_keywords text;