-- Add customer domain field to tasks table
ALTER TABLE public.tasks ADD COLUMN customer_domain text;