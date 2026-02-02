-- Create sales performance history table
CREATE TABLE public.sales_performance_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  month_year DATE NOT NULL,
  transferred_orders_count INTEGER NOT NULL DEFAULT 0,
  closed_orders_count INTEGER NOT NULL DEFAULT 0,
  upsell_revenue NUMERIC NOT NULL DEFAULT 0,
  monthly_order_target INTEGER NOT NULL DEFAULT 0,
  monthly_dollar_target NUMERIC NOT NULL DEFAULT 0,
  archived_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, month_year)
);

-- Enable RLS
ALTER TABLE public.sales_performance_history ENABLE ROW LEVEL SECURITY;

-- Admins can view all history
CREATE POLICY "Admins can view all history"
ON public.sales_performance_history
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Users can view their own history
CREATE POLICY "Users can view their own history"
ON public.sales_performance_history
FOR SELECT
USING (auth.uid() = user_id);

-- Service role can manage history (for edge function)
CREATE POLICY "Service role can manage history"
ON public.sales_performance_history
FOR ALL
USING ((auth.jwt() ->> 'role'::text) = 'service_role'::text)
WITH CHECK ((auth.jwt() ->> 'role'::text) = 'service_role'::text);