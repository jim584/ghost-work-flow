-- Fix the sales target attribution to only count once per order group
CREATE OR REPLACE FUNCTION public.handle_sales_target_attribution()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  already_attributed boolean;
BEGIN
  -- Only process if not already attributed and closed_by is set
  IF NEW.target_attributed = false AND NEW.closed_by IS NOT NULL THEN
    
    -- Check if another task in the same order group has already been attributed
    -- For multi-team orders, only the first task should trigger attribution
    IF NEW.order_group_id IS NOT NULL THEN
      SELECT EXISTS (
        SELECT 1 FROM tasks 
        WHERE order_group_id = NEW.order_group_id 
        AND id != NEW.id 
        AND target_attributed = true
      ) INTO already_attributed;
      
      -- If another task in the group was already attributed, just mark this one as attributed without incrementing counts
      IF already_attributed THEN
        NEW.target_attributed := true;
        RETURN NEW;
      END IF;
    END IF;
    
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