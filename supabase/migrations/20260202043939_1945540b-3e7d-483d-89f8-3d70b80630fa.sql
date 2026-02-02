-- Add is_upsell column to tasks table
ALTER TABLE public.tasks ADD COLUMN is_upsell boolean NOT NULL DEFAULT false;

-- Add upsell_revenue column to sales_targets for tracking PM upsells
ALTER TABLE public.sales_targets ADD COLUMN upsell_revenue numeric NOT NULL DEFAULT 0;

-- Update the attribution trigger to handle upsells
CREATE OR REPLACE FUNCTION public.handle_sales_target_attribution()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  -- Only process if not already attributed and closed_by is set
  IF NEW.target_attributed = false AND NEW.closed_by IS NOT NULL THEN
    -- Mark as attributed immediately
    NEW.target_attributed := true;
    
    -- Check if this is an upsell order
    IF NEW.is_upsell = true THEN
      -- For upsells, track the revenue amount against the PM who created it
      INSERT INTO public.sales_targets (user_id, upsell_revenue, transferred_orders_count, closed_orders_count)
      VALUES (NEW.project_manager_id, COALESCE(NEW.amount_total, 0), 0, 0)
      ON CONFLICT (user_id) 
      DO UPDATE SET 
        upsell_revenue = sales_targets.upsell_revenue + COALESCE(NEW.amount_total, 0),
        updated_at = now();
    ELSE
      -- Standard order attribution logic
      -- Case 1: Transferred By and Closed By are different users
      IF NEW.transferred_by IS NOT NULL AND NEW.transferred_by != NEW.closed_by THEN
        -- Upsert transferred count for transferred_by user
        INSERT INTO public.sales_targets (user_id, transferred_orders_count, closed_orders_count, upsell_revenue)
        VALUES (NEW.transferred_by, 1, 0, 0)
        ON CONFLICT (user_id) 
        DO UPDATE SET 
          transferred_orders_count = sales_targets.transferred_orders_count + 1,
          updated_at = now();
        
        -- Upsert closed count for closed_by user
        INSERT INTO public.sales_targets (user_id, transferred_orders_count, closed_orders_count, upsell_revenue)
        VALUES (NEW.closed_by, 0, 1, 0)
        ON CONFLICT (user_id) 
        DO UPDATE SET 
          closed_orders_count = sales_targets.closed_orders_count + 1,
          updated_at = now();
      
      -- Case 2 & 3: Same user or no transferred_by - only increment closed
      ELSE
        INSERT INTO public.sales_targets (user_id, transferred_orders_count, closed_orders_count, upsell_revenue)
        VALUES (NEW.closed_by, 0, 1, 0)
        ON CONFLICT (user_id) 
        DO UPDATE SET 
          closed_orders_count = sales_targets.closed_orders_count + 1,
          updated_at = now();
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$function$;