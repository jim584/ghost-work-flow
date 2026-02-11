
-- Step 1A: Create availability_calendars table
CREATE TABLE public.availability_calendars (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  timezone text NOT NULL DEFAULT 'Asia/Karachi',
  working_days integer[] NOT NULL DEFAULT '{1,2,3,4,5,6}',
  start_time time NOT NULL DEFAULT '10:00',
  end_time time NOT NULL DEFAULT '19:00',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.availability_calendars ENABLE ROW LEVEL SECURITY;

-- Admins full CRUD
CREATE POLICY "Admins can manage calendars" ON public.availability_calendars FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- PMs can view
CREATE POLICY "PMs can view calendars" ON public.availability_calendars FOR SELECT
  USING (has_role(auth.uid(), 'project_manager'::app_role));

-- Developers can view
CREATE POLICY "Developers can view calendars" ON public.availability_calendars FOR SELECT
  USING (has_role(auth.uid(), 'developer'::app_role));

-- Front Sales can view
CREATE POLICY "Front Sales can view calendars" ON public.availability_calendars FOR SELECT
  USING (has_role(auth.uid(), 'front_sales'::app_role));

-- Updated_at trigger
CREATE TRIGGER update_availability_calendars_updated_at
  BEFORE UPDATE ON public.availability_calendars
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Step 1B: Create developers table
CREATE TABLE public.developers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE NOT NULL REFERENCES public.profiles(id),
  name text NOT NULL,
  timezone text NOT NULL DEFAULT 'Asia/Karachi',
  availability_calendar_id uuid NOT NULL REFERENCES public.availability_calendars(id),
  is_active boolean NOT NULL DEFAULT true,
  round_robin_position integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.developers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage developers" ON public.developers FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "PMs can view developers" ON public.developers FOR SELECT
  USING (has_role(auth.uid(), 'project_manager'::app_role));

CREATE POLICY "Developers can view own record" ON public.developers FOR SELECT
  USING (has_role(auth.uid(), 'developer'::app_role) AND user_id = auth.uid());

CREATE POLICY "Front Sales can view developers" ON public.developers FOR SELECT
  USING (has_role(auth.uid(), 'front_sales'::app_role));

CREATE TRIGGER update_developers_updated_at
  BEFORE UPDATE ON public.developers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Step 1C: Create leave_records table
CREATE TABLE public.leave_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  developer_id uuid NOT NULL REFERENCES public.developers(id),
  leave_start_datetime timestamptz NOT NULL,
  leave_end_datetime timestamptz NOT NULL,
  reason text,
  status text NOT NULL DEFAULT 'pending',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.leave_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage leave records" ON public.leave_records FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "PMs can view leave records" ON public.leave_records FOR SELECT
  USING (has_role(auth.uid(), 'project_manager'::app_role));

CREATE POLICY "Developers can view own leave records" ON public.leave_records FOR SELECT
  USING (has_role(auth.uid(), 'developer'::app_role) AND developer_id IN (
    SELECT id FROM public.developers WHERE user_id = auth.uid()
  ));

-- Step 1D: Create project_phases table
CREATE TABLE public.project_phases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id),
  phase_number integer NOT NULL,
  sla_hours integer NOT NULL DEFAULT 8,
  sla_deadline timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.project_phases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage project phases" ON public.project_phases FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "PMs can view all project phases" ON public.project_phases FOR SELECT
  USING (has_role(auth.uid(), 'project_manager'::app_role));

CREATE POLICY "Developers can view own team phases" ON public.project_phases FOR SELECT
  USING (has_role(auth.uid(), 'developer'::app_role) AND task_id IN (
    SELECT id FROM public.tasks WHERE team_id IN (
      SELECT team_id FROM public.team_members WHERE user_id = auth.uid()
    )
  ));

CREATE POLICY "Developers can update own team phases" ON public.project_phases FOR UPDATE
  USING (has_role(auth.uid(), 'developer'::app_role) AND task_id IN (
    SELECT id FROM public.tasks WHERE team_id IN (
      SELECT team_id FROM public.team_members WHERE user_id = auth.uid()
    )
  ))
  WITH CHECK (has_role(auth.uid(), 'developer'::app_role) AND task_id IN (
    SELECT id FROM public.tasks WHERE team_id IN (
      SELECT team_id FROM public.team_members WHERE user_id = auth.uid()
    )
  ));

CREATE POLICY "Front Sales can view project phases" ON public.project_phases FOR SELECT
  USING (has_role(auth.uid(), 'front_sales'::app_role));

CREATE POLICY "Service role can manage project phases" ON public.project_phases FOR ALL
  USING ((auth.jwt() ->> 'role'::text) = 'service_role'::text)
  WITH CHECK ((auth.jwt() ->> 'role'::text) = 'service_role'::text);

-- Step 1E: Add new columns to tasks table
ALTER TABLE public.tasks
  ADD COLUMN developer_id uuid REFERENCES public.developers(id),
  ADD COLUMN acknowledged_at timestamptz,
  ADD COLUMN current_phase integer DEFAULT 1,
  ADD COLUMN total_phases integer DEFAULT 4,
  ADD COLUMN sla_deadline timestamptz;

-- Step 1F: Add 'assigned' to task_status enum
ALTER TYPE public.task_status ADD VALUE IF NOT EXISTS 'assigned';

-- Step 1G: Seed default calendar
INSERT INTO public.availability_calendars (name, timezone, working_days, start_time, end_time)
VALUES ('Standard PK Shift', 'Asia/Karachi', '{1,2,3,4,5,6}', '10:00', '19:00');

-- Step 1H: Update notification type constraint to include 'acknowledgement_overdue'
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('new_task', 'revision_requested', 'task_delayed', 'file_uploaded', 'order_cancelled', 'acknowledgement_overdue'));

-- Step 1I: Create get_next_available_developer RPC
CREATE OR REPLACE FUNCTION public.get_next_available_developer()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  active_developers jsonb[];
  developer_count integer;
  current_index integer;
  next_index integer;
  selected_developer record;
  developer_team_id uuid;
  result jsonb;
BEGIN
  -- Get all active developers ordered by round_robin_position
  SELECT array_agg(
    jsonb_build_object(
      'id', d.id,
      'user_id', d.user_id,
      'name', d.name
    ) ORDER BY d.round_robin_position
  )
  INTO active_developers
  FROM developers d
  WHERE d.is_active = true;

  -- If no active developers, return null
  IF active_developers IS NULL OR array_length(active_developers, 1) IS NULL THEN
    RETURN NULL;
  END IF;

  developer_count := array_length(active_developers, 1);

  -- Get current pointer
  SELECT last_assigned_index INTO current_index
  FROM website_order_assignment
  LIMIT 1;

  -- Calculate next index (wrap around)
  next_index := current_index % developer_count;

  -- Get selected developer (1-indexed)
  result := active_developers[next_index + 1];

  -- Look up team_id for this developer
  SELECT tm.team_id INTO developer_team_id
  FROM team_members tm
  WHERE tm.user_id = (result->>'user_id')::uuid
  LIMIT 1;

  -- Update pointer
  UPDATE website_order_assignment
  SET last_assigned_index = next_index + 1, updated_at = now()
  WHERE TRUE;

  -- Add team_id to result
  result := result || jsonb_build_object('team_id', developer_team_id);

  RETURN result;
END;
$$;
