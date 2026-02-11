
-- Add Saturday-specific working hours to availability_calendars
ALTER TABLE public.availability_calendars
  ADD COLUMN saturday_start_time time WITHOUT TIME ZONE DEFAULT '10:00:00'::time,
  ADD COLUMN saturday_end_time time WITHOUT TIME ZONE DEFAULT '15:00:00'::time;
