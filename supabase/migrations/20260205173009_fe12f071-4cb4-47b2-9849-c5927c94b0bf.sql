-- Add order_group_id to link related tasks for multi-team orders
ALTER TABLE public.tasks 
ADD COLUMN order_group_id uuid DEFAULT NULL;

-- Index for efficient grouping queries
CREATE INDEX idx_tasks_order_group_id ON public.tasks(order_group_id);