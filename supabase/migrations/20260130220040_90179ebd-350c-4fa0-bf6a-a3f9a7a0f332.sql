-- Add customer and payment fields to tasks table
ALTER TABLE public.tasks
ADD COLUMN customer_name text,
ADD COLUMN customer_email text,
ADD COLUMN customer_phone text,
ADD COLUMN amount_paid numeric(10,2) DEFAULT 0,
ADD COLUMN amount_pending numeric(10,2) DEFAULT 0,
ADD COLUMN amount_total numeric(10,2) DEFAULT 0;