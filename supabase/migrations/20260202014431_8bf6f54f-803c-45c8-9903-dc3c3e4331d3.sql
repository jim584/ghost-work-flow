-- Create sales_targets table to store monthly order targets per sales user
CREATE TABLE public.sales_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  monthly_order_target integer NOT NULL DEFAULT 10,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.sales_targets ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own target"
ON public.sales_targets
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all targets"
ON public.sales_targets
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert targets"
ON public.sales_targets
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update targets"
ON public.sales_targets
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete targets"
ON public.sales_targets
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Trigger for updated_at
CREATE TRIGGER update_sales_targets_updated_at
BEFORE UPDATE ON public.sales_targets
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create target when front_sales role is assigned
CREATE OR REPLACE FUNCTION public.create_sales_target()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role = 'front_sales'::app_role THEN
    INSERT INTO public.sales_targets (user_id, monthly_order_target)
    VALUES (NEW.user_id, 10)
    ON CONFLICT (user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER create_sales_target_on_role
AFTER INSERT ON public.user_roles
FOR EACH ROW
EXECUTE FUNCTION public.create_sales_target();