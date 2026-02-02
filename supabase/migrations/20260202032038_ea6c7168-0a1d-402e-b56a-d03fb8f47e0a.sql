-- Add attribution tracking columns to sales_targets
ALTER TABLE public.sales_targets 
ADD COLUMN IF NOT EXISTS transferred_orders_count integer NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS closed_orders_count integer NOT NULL DEFAULT 0;

-- Add target_attributed flag to tasks to prevent re-counting
ALTER TABLE public.tasks 
ADD COLUMN IF NOT EXISTS target_attributed boolean NOT NULL DEFAULT false;

-- Create function to handle target attribution on task creation
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
      -- Increment transferred count for transferred_by user
      UPDATE public.sales_targets 
      SET transferred_orders_count = transferred_orders_count + 1,
          updated_at = now()
      WHERE user_id = NEW.transferred_by;
      
      -- Increment closed count for closed_by user
      UPDATE public.sales_targets 
      SET closed_orders_count = closed_orders_count + 1,
          updated_at = now()
      WHERE user_id = NEW.closed_by;
      
    -- Case 2 & 3: Same user or no transferred_by - only increment closed
    ELSE
      UPDATE public.sales_targets 
      SET closed_orders_count = closed_orders_count + 1,
          updated_at = now()
      WHERE user_id = NEW.closed_by;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger for attribution (BEFORE INSERT to modify NEW.target_attributed)
DROP TRIGGER IF EXISTS trigger_sales_target_attribution ON public.tasks;
CREATE TRIGGER trigger_sales_target_attribution
  BEFORE INSERT ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_sales_target_attribution();