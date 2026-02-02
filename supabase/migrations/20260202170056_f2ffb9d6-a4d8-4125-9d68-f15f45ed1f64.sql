-- Add closed_revenue column to track revenue attributed to closers
ALTER TABLE public.sales_targets 
ADD COLUMN IF NOT EXISTS closed_revenue numeric NOT NULL DEFAULT 0;

-- Also add to history table for archiving
ALTER TABLE public.sales_performance_history 
ADD COLUMN IF NOT EXISTS closed_revenue numeric NOT NULL DEFAULT 0;

-- Update the attribution trigger to include revenue for closer
CREATE OR REPLACE FUNCTION public.handle_sales_target_attribution()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Only process if not already attributed and closed_by is set
  IF NEW.target_attributed = false AND NEW.closed_by IS NOT NULL THEN
    -- Mark as attributed immediately
    NEW.target_attributed := true;
    
    -- Check if this is an upsell order
    IF NEW.is_upsell = true THEN
      -- For upsells, track the revenue amount against the PM who created it
      INSERT INTO public.sales_targets (user_id, upsell_revenue, transferred_orders_count, closed_orders_count, closed_revenue)
      VALUES (NEW.project_manager_id, COALESCE(NEW.amount_total, 0), 0, 0, 0)
      ON CONFLICT (user_id) 
      DO UPDATE SET 
        upsell_revenue = sales_targets.upsell_revenue + COALESCE(NEW.amount_total, 0),
        updated_at = now();
    ELSE
      -- Standard order attribution logic
      -- Case 1: Transferred By and Closed By are different users
      IF NEW.transferred_by IS NOT NULL AND NEW.transferred_by != NEW.closed_by THEN
        -- Upsert transferred count for transferred_by user (no revenue)
        INSERT INTO public.sales_targets (user_id, transferred_orders_count, closed_orders_count, upsell_revenue, closed_revenue)
        VALUES (NEW.transferred_by, 1, 0, 0, 0)
        ON CONFLICT (user_id) 
        DO UPDATE SET 
          transferred_orders_count = sales_targets.transferred_orders_count + 1,
          updated_at = now();
        
        -- Upsert closed count AND revenue for closed_by user
        INSERT INTO public.sales_targets (user_id, transferred_orders_count, closed_orders_count, upsell_revenue, closed_revenue)
        VALUES (NEW.closed_by, 0, 1, 0, COALESCE(NEW.amount_total, 0))
        ON CONFLICT (user_id) 
        DO UPDATE SET 
          closed_orders_count = sales_targets.closed_orders_count + 1,
          closed_revenue = sales_targets.closed_revenue + COALESCE(NEW.amount_total, 0),
          updated_at = now();
      
      -- Case 2 & 3: Same user or no transferred_by - only increment closed + revenue
      ELSE
        INSERT INTO public.sales_targets (user_id, transferred_orders_count, closed_orders_count, upsell_revenue, closed_revenue)
        VALUES (NEW.closed_by, 0, 1, 0, COALESCE(NEW.amount_total, 0))
        ON CONFLICT (user_id) 
        DO UPDATE SET 
          closed_orders_count = sales_targets.closed_orders_count + 1,
          closed_revenue = sales_targets.closed_revenue + COALESCE(NEW.amount_total, 0),
          updated_at = now();
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Update reset function to include closed_revenue
CREATE OR REPLACE FUNCTION public.reset_monthly_sales_targets()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Archive current data before reset
  INSERT INTO public.sales_performance_history (
    user_id, 
    month_year, 
    transferred_orders_count, 
    closed_orders_count, 
    upsell_revenue, 
    closed_revenue,
    monthly_order_target, 
    monthly_dollar_target
  )
  SELECT 
    user_id,
    date_trunc('month', now() - interval '1 day')::date,
    transferred_orders_count,
    closed_orders_count,
    upsell_revenue,
    closed_revenue,
    monthly_order_target,
    monthly_dollar_target
  FROM public.sales_targets;
  
  -- Reset counts and revenue (keep targets)
  UPDATE public.sales_targets 
  SET 
    transferred_orders_count = 0,
    closed_orders_count = 0,
    upsell_revenue = 0,
    closed_revenue = 0,
    updated_at = now();
END;
$function$;