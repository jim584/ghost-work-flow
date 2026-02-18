
-- Add dedicated domain credential columns
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS launch_domain_username text;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS launch_domain_password text;
