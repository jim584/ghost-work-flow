-- Add monthly dollar target for PMs
ALTER TABLE public.sales_targets 
ADD COLUMN IF NOT EXISTS monthly_dollar_target numeric NOT NULL DEFAULT 0;