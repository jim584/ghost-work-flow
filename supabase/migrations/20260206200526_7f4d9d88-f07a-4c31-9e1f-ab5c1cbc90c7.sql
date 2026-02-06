
-- Add 'cancelled' to the task_status enum
ALTER TYPE public.task_status ADD VALUE IF NOT EXISTS 'cancelled';

-- Add cancellation_reason column to tasks
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS cancellation_reason text;

-- Add cancelled_at timestamp
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS cancelled_at timestamp with time zone;
