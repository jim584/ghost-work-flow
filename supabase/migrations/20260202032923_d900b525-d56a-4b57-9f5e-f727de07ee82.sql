-- Fix the target attribution trigger to use UPSERT logic
-- This ensures sales_targets records are created if they don't exist

CREATE OR REPLACE FUNCTION public.handle_sales_target_attribution()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only process if not already attributed and closed_by is set
  IF NEW.target_attributed = false AND NEW.closed_by IS NOT NULL THEN
    -- Mark as attributed immediately
    NEW.target_attributed := true;
    
    -- Case 1: Transferred By and Closed By are different users
    IF NEW.transferred_by IS NOT NULL AND NEW.transferred_by != NEW.closed_by THEN
      -- Upsert transferred count for transferred_by user
      INSERT INTO public.sales_targets (user_id, transferred_orders_count, closed_orders_count)
      VALUES (NEW.transferred_by, 1, 0)
      ON CONFLICT (user_id) 
      DO UPDATE SET 
        transferred_orders_count = sales_targets.transferred_orders_count + 1,
        updated_at = now();
      
      -- Upsert closed count for closed_by user
      INSERT INTO public.sales_targets (user_id, transferred_orders_count, closed_orders_count)
      VALUES (NEW.closed_by, 0, 1)
      ON CONFLICT (user_id) 
      DO UPDATE SET 
        closed_orders_count = sales_targets.closed_orders_count + 1,
        updated_at = now();
      
    -- Case 2 & 3: Same user or no transferred_by - only increment closed
    ELSE
      INSERT INTO public.sales_targets (user_id, transferred_orders_count, closed_orders_count)
      VALUES (NEW.closed_by, 0, 1)
      ON CONFLICT (user_id) 
      DO UPDATE SET 
        closed_orders_count = sales_targets.closed_orders_count + 1,
        updated_at = now();
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;