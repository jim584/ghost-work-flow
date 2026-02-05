
# Clear All Orders for Testing

## Overview
Delete all existing orders/tasks and related data from the database to start fresh testing.

## Tables to Clear

The following tables need to be cleared in this order (due to foreign key relationships):

1. **design_submissions** - File submissions linked to tasks
2. **task_delay_notifications** - Delay notifications linked to tasks  
3. **notifications** - All notifications (many are task-related)
4. **tasks** - The main orders/tasks table
5. **sales_targets** - Reset the counters to zero (keep records, just reset counts)

## SQL Migration

```sql
-- Clear all task-related data for fresh testing
-- Order matters due to foreign key relationships

-- 1. Delete all design submissions
DELETE FROM public.design_submissions;

-- 2. Delete all task delay notifications
DELETE FROM public.task_delay_notifications;

-- 3. Delete all notifications
DELETE FROM public.notifications;

-- 4. Delete all tasks
DELETE FROM public.tasks;

-- 5. Reset sales target counters (keep the records)
UPDATE public.sales_targets 
SET transferred_orders_count = 0,
    closed_orders_count = 0,
    upsell_revenue = 0,
    closed_revenue = 0;

-- 6. Reset website order assignment tracker
UPDATE public.website_order_assignment 
SET last_assigned_index = 0;
```

## What This Does
- Removes all orders from Admin, PM, Designer, Developer, and Front Sales dashboards
- Clears all file submissions
- Clears all notifications
- Resets sales performance counters to zero
- Resets the website auto-assignment rotation

## After Clearing
You'll have a clean slate to test the new file upload notification feature end-to-end.
