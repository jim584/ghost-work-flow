-- ============================================================
-- FULL MIGRATION SCRIPT
-- From: Lovable Cloud (project vxiipdlmkhcmkliygoyg)
-- To: Self-managed Supabase
-- Generated: 2026-03-05
-- ============================================================

-- ============================================================
-- 1. ENUMS
-- ============================================================

CREATE TYPE public.app_role AS ENUM (
  'admin',
  'project_manager',
  'designer',
  'developer',
  'front_sales',
  'development_team_leader'
);

CREATE TYPE public.task_status AS ENUM (
  'pending',
  'in_progress',
  'completed',
  'approved',
  'cancelled',
  'assigned',
  'on_hold'
);

-- ============================================================
-- 2. TABLES (in dependency order)
-- ============================================================

-- profiles (referenced by many tables)
CREATE TABLE public.profiles (
  id uuid NOT NULL PRIMARY KEY,
  email text NOT NULL,
  full_name text,
  team_name text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- teams
CREATE TABLE public.teams (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  description text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- team_members
CREATE TABLE public.team_members (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id uuid NOT NULL REFERENCES public.teams(id),
  user_id uuid NOT NULL REFERENCES public.profiles(id),
  joined_at timestamptz DEFAULT now()
);

-- user_roles
CREATE TABLE public.user_roles (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE (user_id, role)
);

-- availability_calendars
CREATE TABLE public.availability_calendars (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  timezone text NOT NULL DEFAULT 'Asia/Karachi',
  working_days integer[] NOT NULL DEFAULT '{1,2,3,4,5,6}',
  start_time time NOT NULL DEFAULT '10:00:00',
  end_time time NOT NULL DEFAULT '19:00:00',
  saturday_start_time time DEFAULT '10:00:00',
  saturday_end_time time DEFAULT '15:00:00',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- developers
CREATE TABLE public.developers (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) UNIQUE,
  name text NOT NULL,
  timezone text NOT NULL DEFAULT 'Asia/Karachi',
  availability_calendar_id uuid NOT NULL REFERENCES public.availability_calendars(id),
  is_active boolean NOT NULL DEFAULT true,
  round_robin_position integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- tasks (sequence + table)
CREATE SEQUENCE public.tasks_task_number_seq START WITH 1;

CREATE TABLE public.tasks (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_number integer NOT NULL DEFAULT nextval('tasks_task_number_seq'),
  team_id uuid NOT NULL REFERENCES public.teams(id),
  project_manager_id uuid NOT NULL REFERENCES public.profiles(id),
  status public.task_status NOT NULL DEFAULT 'pending',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  deadline date,
  amount_paid numeric DEFAULT 0,
  amount_pending numeric DEFAULT 0,
  amount_total numeric DEFAULT 0,
  content_provided boolean DEFAULT false,
  created_by uuid,
  reassigned_from uuid,
  reassigned_at timestamptz,
  transferred_by uuid REFERENCES public.profiles(id),
  closed_by uuid REFERENCES public.profiles(id),
  target_attributed boolean NOT NULL DEFAULT false,
  is_upsell boolean NOT NULL DEFAULT false,
  accepted_by_pm boolean NOT NULL DEFAULT false,
  order_group_id uuid,
  cancelled_at timestamptz,
  is_deleted boolean NOT NULL DEFAULT false,
  developer_id uuid REFERENCES public.developers(id),
  acknowledged_at timestamptz,
  current_phase integer DEFAULT 1,
  total_phases integer,
  sla_deadline timestamptz,
  ack_deadline timestamptz,
  late_acknowledgement boolean NOT NULL DEFAULT false,
  reassignment_requested_at timestamptz,
  held_at timestamptz,
  held_by uuid,
  launch_hosting_total numeric DEFAULT 0,
  launch_hosting_paid numeric DEFAULT 0,
  launch_hosting_pending numeric DEFAULT 0,
  launch_website_live_at timestamptz,
  launch_website_live_by uuid,
  upsell_verified_at timestamptz,
  upsell_verified_by uuid,
  upsell_completed_at timestamptz,
  title text NOT NULL,
  description text,
  business_name text,
  industry text,
  website_url text,
  post_type text,
  objective text,
  product_service_name text,
  product_service_images text,
  product_service_description text,
  pricing text,
  post_type_required text,
  design_style text,
  brand_colors text,
  fonts text,
  logo_url text,
  headline_main_text text,
  supporting_text text,
  cta text,
  target_audience_age text,
  target_audience_location text,
  target_audience_interest text,
  target_audience_other text,
  platforms text[],
  notes_extra_instructions text,
  additional_details text,
  attachment_file_path text,
  attachment_file_name text,
  logo_type text,
  logo_style text,
  tagline text,
  number_of_concepts text,
  number_of_revisions text,
  file_formats_needed text,
  usage_type text,
  competitors_inspiration text,
  customer_name text,
  customer_email text,
  customer_phone text,
  customer_domain text,
  website_type text,
  number_of_pages text,
  website_features text,
  domain_hosting_status text,
  design_references text,
  website_deadline_type text,
  business_email text,
  business_phone text,
  video_keywords text,
  reassignment_reason text,
  reassignment_request_reason text,
  hold_reason text,
  cancellation_reason text,
  upsell_status text,
  upsell_notes text,
  launch_domain text,
  launch_access_method text,
  launch_domain_provider text,
  launch_domain_username text,
  launch_domain_password text,
  launch_hosting_provider text DEFAULT 'plex_hosting',
  launch_hosting_provider_name text,
  launch_hosting_access_method text,
  launch_hosting_username text,
  launch_hosting_password text,
  launch_hosting_delegate_status text,
  launch_delegate_status text,
  launch_self_launch_status text,
  launch_wetransfer_link text,
  launch_nameserver_status text,
  launch_nameserver_1 text,
  launch_nameserver_2 text,
  launch_nameserver_3 text,
  launch_nameserver_4 text,
  launch_dns_status text,
  launch_dns_a_record text,
  launch_dns_cname text,
  launch_dns_mx_record text
);

-- design_submissions
CREATE TABLE public.design_submissions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id uuid NOT NULL REFERENCES public.tasks(id),
  designer_id uuid NOT NULL REFERENCES public.profiles(id),
  file_path text NOT NULL,
  file_name text NOT NULL,
  submitted_at timestamptz DEFAULT now(),
  revision_status text DEFAULT 'pending_review',
  revision_notes text,
  reviewed_at timestamptz,
  reviewed_by uuid,
  revision_reference_file_path text,
  revision_reference_file_name text,
  designer_comment text,
  parent_submission_id uuid REFERENCES public.design_submissions(id)
);

-- project_phases
CREATE TABLE public.project_phases (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id uuid NOT NULL REFERENCES public.tasks(id),
  phase_number integer NOT NULL,
  sla_hours integer NOT NULL DEFAULT 8,
  sla_deadline timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  pages_completed integer NOT NULL DEFAULT 3,
  points integer NOT NULL DEFAULT 3,
  reviewed_at timestamptz,
  reviewed_by uuid,
  change_deadline timestamptz,
  change_completed_at timestamptz,
  started_by uuid,
  completed_by uuid,
  change_completed_by uuid,
  held_at timestamptz,
  held_by uuid,
  status text NOT NULL DEFAULT 'pending',
  review_status text,
  review_comment text,
  change_severity text,
  review_voice_path text,
  review_file_paths text,
  review_file_names text,
  submission_file_paths text,
  submission_file_names text,
  submission_comment text,
  change_comment text,
  change_file_paths text,
  change_file_names text,
  hold_reason text
);

-- phase_reviews
CREATE TABLE public.phase_reviews (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  phase_id uuid NOT NULL REFERENCES public.project_phases(id),
  task_id uuid NOT NULL REFERENCES public.tasks(id),
  reviewed_by uuid NOT NULL,
  reviewed_at timestamptz NOT NULL DEFAULT now(),
  review_status text NOT NULL,
  review_comment text,
  review_voice_path text,
  review_file_paths text,
  review_file_names text,
  change_deadline timestamptz,
  change_completed_at timestamptz,
  change_completed_by uuid,
  change_comment text,
  change_file_paths text,
  change_file_names text,
  change_severity text,
  round_number integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  dev_read_at timestamptz,
  superseded_at timestamptz,
  superseded_by uuid
);

-- phase_review_replies
CREATE TABLE public.phase_review_replies (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  phase_review_id uuid NOT NULL REFERENCES public.phase_reviews(id),
  task_id uuid NOT NULL REFERENCES public.tasks(id),
  user_id uuid NOT NULL,
  message text,
  voice_path text,
  file_paths text,
  file_names text,
  created_at timestamptz NOT NULL DEFAULT now(),
  pm_read_at timestamptz,
  dev_read_at timestamptz
);

-- order_messages
CREATE TABLE public.order_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id uuid NOT NULL REFERENCES public.tasks(id),
  sender_id uuid NOT NULL,
  message text NOT NULL,
  file_path text,
  file_name text,
  parent_message_id uuid REFERENCES public.order_messages(id),
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- order_message_reads
CREATE TABLE public.order_message_reads (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id uuid NOT NULL REFERENCES public.order_messages(id),
  user_id uuid NOT NULL,
  read_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id)
);

-- message_reactions
CREATE TABLE public.message_reactions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id uuid NOT NULL REFERENCES public.order_messages(id),
  user_id uuid NOT NULL,
  emoji text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id, emoji)
);

-- notifications
CREATE TABLE public.notifications (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  type text NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  task_id uuid REFERENCES public.tasks(id),
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- task_delay_notifications
CREATE TABLE public.task_delay_notifications (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id uuid NOT NULL REFERENCES public.tasks(id),
  notification_sent_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- task_hold_events
CREATE TABLE public.task_hold_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id uuid NOT NULL REFERENCES public.tasks(id),
  performed_by uuid NOT NULL,
  event_type text NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- reassignment_history
CREATE TABLE public.reassignment_history (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id uuid NOT NULL REFERENCES public.tasks(id),
  from_developer_id uuid REFERENCES public.developers(id),
  to_developer_id uuid NOT NULL REFERENCES public.developers(id),
  reassigned_by uuid NOT NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- leave_records
CREATE TABLE public.leave_records (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  developer_id uuid NOT NULL REFERENCES public.developers(id),
  leave_start_datetime timestamptz NOT NULL,
  leave_end_datetime timestamptz NOT NULL,
  created_by uuid,
  reason text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- sales_targets
CREATE TABLE public.sales_targets (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE,
  monthly_order_target integer NOT NULL DEFAULT 10,
  monthly_dollar_target numeric NOT NULL DEFAULT 0,
  transferred_orders_count integer NOT NULL DEFAULT 0,
  closed_orders_count integer NOT NULL DEFAULT 0,
  upsell_revenue numeric NOT NULL DEFAULT 0,
  closed_revenue numeric NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- sales_performance_history
CREATE TABLE public.sales_performance_history (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  month_year date NOT NULL,
  transferred_orders_count integer NOT NULL DEFAULT 0,
  closed_orders_count integer NOT NULL DEFAULT 0,
  upsell_revenue numeric NOT NULL DEFAULT 0,
  closed_revenue numeric NOT NULL DEFAULT 0,
  monthly_order_target integer NOT NULL DEFAULT 0,
  monthly_dollar_target numeric NOT NULL DEFAULT 0,
  archived_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, month_year)
);

-- website_order_assignment
CREATE TABLE public.website_order_assignment (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  last_assigned_index integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Insert initial row for round-robin tracker
INSERT INTO public.website_order_assignment (last_assigned_index) VALUES (0);

-- ============================================================
-- 3. DATABASE FUNCTIONS
-- ============================================================

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email)
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_profile_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_safe_filename(filename text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF filename LIKE '%..%' OR filename LIKE '%/%' OR filename LIKE '%\%' THEN RETURN FALSE; END IF;
  IF filename LIKE '.%' THEN RETURN FALSE; END IF;
  IF filename ~ '[\x00-\x1f]' THEN RETURN FALSE; END IF;
  IF filename ~ '^[a-zA-Z0-9._-]+$' THEN RETURN TRUE; END IF;
  RETURN FALSE;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_user_role(target_user_id uuid, role_name app_role)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can assign roles';
  END IF;
  DELETE FROM public.user_roles WHERE user_id = target_user_id;
  INSERT INTO public.user_roles (user_id, role) VALUES (target_user_id, role_name);
END;
$$;

CREATE OR REPLACE FUNCTION public.set_user_role_designer()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.user_roles (user_id, role)
  VALUES (auth.uid(), 'designer'::app_role)
  ON CONFLICT (user_id, role) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_user_role_developer()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.user_roles (user_id, role)
  VALUES (auth.uid(), 'developer'::app_role)
  ON CONFLICT (user_id, role) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_user_role_front_sales()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.user_roles (user_id, role)
  VALUES (auth.uid(), 'front_sales');
END;
$$;

CREATE OR REPLACE FUNCTION public.create_designer_team()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  display_name TEXT;
  new_team_id UUID;
BEGIN
  IF NEW.role IN ('designer'::app_role, 'developer'::app_role) THEN
    SELECT COALESCE(team_name, full_name, email) INTO display_name
    FROM public.profiles WHERE id = NEW.user_id;
    
    INSERT INTO public.teams (name, description)
    VALUES (
      display_name,
      CASE WHEN NEW.role = 'developer'::app_role THEN 'Personal team for developer'
           ELSE 'Personal team for designer' END
    ) RETURNING id INTO new_team_id;
    
    INSERT INTO public.team_members (team_id, user_id) VALUES (new_team_id, NEW.user_id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_task_notifications()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  designer_record RECORD;
BEGIN
  FOR designer_record IN 
    SELECT DISTINCT tm.user_id
    FROM team_members tm
    JOIN user_roles ur ON ur.user_id = tm.user_id
    WHERE tm.team_id = NEW.team_id AND ur.role = 'designer'
  LOOP
    INSERT INTO public.notifications (user_id, type, title, message, task_id)
    VALUES (designer_record.user_id, 'new_task', 'New Task Assigned', 'Task: ' || NEW.title, NEW.id);
  END LOOP;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_submission_notifications()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  task_record RECORD;
  designer_name TEXT;
BEGIN
  SELECT t.id, t.title, t.project_manager_id INTO task_record FROM tasks t WHERE t.id = NEW.task_id;
  SELECT COALESCE(full_name, email) INTO designer_name FROM profiles WHERE id = NEW.designer_id;
  
  INSERT INTO public.notifications (user_id, type, title, message, task_id)
  VALUES (
    task_record.project_manager_id, 'file_uploaded', 'New File Uploaded',
    'Designer ' || COALESCE(designer_name, 'Unknown') || ' uploaded a file for: ' || task_record.title,
    NEW.task_id
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_revision_notifications()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  task_title TEXT;
BEGIN
  IF NEW.revision_status = 'needs_revision' AND 
     (OLD.revision_status IS NULL OR OLD.revision_status != 'needs_revision') THEN
    SELECT title INTO task_title FROM tasks WHERE id = NEW.task_id;
    INSERT INTO public.notifications (user_id, type, title, message, task_id)
    VALUES (NEW.designer_id, 'revision_requested', 'Revision Requested',
            COALESCE(NEW.revision_notes, 'Please check the task details'), NEW.task_id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_sales_target()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.role = 'front_sales'::app_role THEN
    INSERT INTO public.sales_targets (user_id, monthly_order_target)
    VALUES (NEW.user_id, 10) ON CONFLICT (user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_sales_target_attribution()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  already_attributed boolean;
BEGIN
  IF NEW.target_attributed = false AND NEW.closed_by IS NOT NULL THEN
    IF NEW.order_group_id IS NOT NULL THEN
      SELECT EXISTS (
        SELECT 1 FROM tasks WHERE order_group_id = NEW.order_group_id AND id != NEW.id AND target_attributed = true
      ) INTO already_attributed;
      IF already_attributed THEN
        NEW.target_attributed := true;
        RETURN NEW;
      END IF;
    END IF;
    
    NEW.target_attributed := true;
    
    IF NEW.is_upsell = true THEN
      INSERT INTO public.sales_targets (user_id, upsell_revenue, transferred_orders_count, closed_orders_count, closed_revenue)
      VALUES (NEW.project_manager_id, COALESCE(NEW.amount_total, 0), 0, 0, 0)
      ON CONFLICT (user_id) DO UPDATE SET upsell_revenue = sales_targets.upsell_revenue + COALESCE(NEW.amount_total, 0), updated_at = now();
    ELSE
      IF NEW.transferred_by IS NOT NULL AND NEW.transferred_by != NEW.closed_by THEN
        INSERT INTO public.sales_targets (user_id, transferred_orders_count, closed_orders_count, upsell_revenue, closed_revenue)
        VALUES (NEW.transferred_by, 1, 0, 0, 0)
        ON CONFLICT (user_id) DO UPDATE SET transferred_orders_count = sales_targets.transferred_orders_count + 1, updated_at = now();
        
        INSERT INTO public.sales_targets (user_id, transferred_orders_count, closed_orders_count, upsell_revenue, closed_revenue)
        VALUES (NEW.closed_by, 0, 1, 0, COALESCE(NEW.amount_total, 0))
        ON CONFLICT (user_id) DO UPDATE SET closed_orders_count = sales_targets.closed_orders_count + 1, closed_revenue = sales_targets.closed_revenue + COALESCE(NEW.amount_total, 0), updated_at = now();
      ELSE
        INSERT INTO public.sales_targets (user_id, transferred_orders_count, closed_orders_count, upsell_revenue, closed_revenue)
        VALUES (NEW.closed_by, 0, 1, 0, COALESCE(NEW.amount_total, 0))
        ON CONFLICT (user_id) DO UPDATE SET closed_orders_count = sales_targets.closed_orders_count + 1, closed_revenue = sales_targets.closed_revenue + COALESCE(NEW.amount_total, 0), updated_at = now();
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.reset_monthly_sales_targets()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.sales_performance_history (
    user_id, month_year, transferred_orders_count, closed_orders_count,
    upsell_revenue, closed_revenue, monthly_order_target, monthly_dollar_target
  )
  SELECT user_id, date_trunc('month', now() - interval '1 day')::date,
    transferred_orders_count, closed_orders_count, upsell_revenue, closed_revenue,
    monthly_order_target, monthly_dollar_target
  FROM public.sales_targets;
  
  UPDATE public.sales_targets SET
    transferred_orders_count = 0, closed_orders_count = 0,
    upsell_revenue = 0, closed_revenue = 0, updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.get_next_developer_team()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  developer_teams uuid[];
  current_index integer;
  next_index integer;
  next_team_id uuid;
BEGIN
  SELECT ARRAY(
    SELECT DISTINCT tm.team_id FROM team_members tm
    JOIN user_roles ur ON ur.user_id = tm.user_id
    WHERE ur.role = 'developer'::app_role ORDER BY tm.team_id
  ) INTO developer_teams;
  
  IF array_length(developer_teams, 1) IS NULL THEN RETURN NULL; END IF;
  
  SELECT last_assigned_index INTO current_index FROM website_order_assignment LIMIT 1;
  next_index := current_index % array_length(developer_teams, 1);
  next_team_id := developer_teams[next_index + 1];
  
  UPDATE website_order_assignment SET last_assigned_index = next_index + 1, updated_at = now() WHERE TRUE;
  RETURN next_team_id;
END;
$$;

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
  SELECT array_agg(
    jsonb_build_object('id', d.id, 'user_id', d.user_id, 'name', d.name)
    ORDER BY d.round_robin_position
  ) INTO active_developers FROM developers d WHERE d.is_active = true;

  IF active_developers IS NULL OR array_length(active_developers, 1) IS NULL THEN RETURN NULL; END IF;

  developer_count := array_length(active_developers, 1);
  SELECT last_assigned_index INTO current_index FROM website_order_assignment LIMIT 1;
  next_index := current_index % developer_count;
  result := active_developers[next_index + 1];

  SELECT tm.team_id INTO developer_team_id FROM team_members tm
  WHERE tm.user_id = (result->>'user_id')::uuid LIMIT 1;

  UPDATE website_order_assignment SET last_assigned_index = next_index + 1, updated_at = now() WHERE TRUE;
  result := result || jsonb_build_object('team_id', developer_team_id);
  RETURN result;
END;
$$;

-- ============================================================
-- 4. TRIGGERS
-- ============================================================

CREATE TRIGGER update_availability_calendars_updated_at
  BEFORE UPDATE ON public.availability_calendars
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER on_revision_requested
  AFTER UPDATE ON public.design_submissions
  FOR EACH ROW EXECUTE FUNCTION create_revision_notifications();

CREATE TRIGGER on_submission_created
  AFTER INSERT ON public.design_submissions
  FOR EACH ROW EXECUTE FUNCTION create_submission_notifications();

CREATE TRIGGER update_developers_updated_at
  BEFORE UPDATE ON public.developers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION update_profile_updated_at();

CREATE TRIGGER update_sales_targets_updated_at
  BEFORE UPDATE ON public.sales_targets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER on_task_created
  AFTER INSERT ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION create_task_notifications();

CREATE TRIGGER trigger_sales_target_attribution
  BEFORE INSERT ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION handle_sales_target_attribution();

CREATE TRIGGER update_tasks_updated_at
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_teams_updated_at
  BEFORE UPDATE ON public.teams
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER create_sales_target_on_role
  AFTER INSERT ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION create_sales_target();

CREATE TRIGGER on_designer_role_assigned
  AFTER INSERT ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION create_designer_team();

-- ============================================================
-- 5. ENABLE ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.availability_calendars ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.developers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.design_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_phases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.phase_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.phase_review_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_message_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_delay_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_hold_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reassignment_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_performance_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.website_order_assignment ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 6. RLS POLICIES
-- ============================================================

-- === profiles ===
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Admins can view all profiles" ON public.profiles FOR SELECT USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "PMs can view all profiles" ON public.profiles FOR SELECT USING (has_role(auth.uid(), 'project_manager'));
CREATE POLICY "Dev team leaders can view all profiles" ON public.profiles FOR SELECT USING (has_role(auth.uid(), 'development_team_leader'));
CREATE POLICY "Designers can view team member profiles" ON public.profiles FOR SELECT USING (
  has_role(auth.uid(), 'designer') AND id IN (
    SELECT tm2.user_id FROM team_members tm1
    JOIN team_members tm2 ON tm1.team_id = tm2.team_id
    WHERE tm1.user_id = auth.uid()
  )
);
CREATE POLICY "Front Sales can view all profiles" ON public.profiles FOR SELECT USING (has_role(auth.uid(), 'front_sales'));
CREATE POLICY "Developers can view team member profiles" ON public.profiles FOR SELECT USING (
  has_role(auth.uid(), 'developer') AND id IN (
    SELECT tm2.user_id FROM team_members tm1
    JOIN team_members tm2 ON tm1.team_id = tm2.team_id
    WHERE tm1.user_id = auth.uid()
  )
);

-- === teams ===
CREATE POLICY "Admins can manage teams" ON public.teams FOR ALL USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "PMs can view all teams" ON public.teams FOR SELECT USING (has_role(auth.uid(), 'project_manager'));
CREATE POLICY "Designers can view their teams" ON public.teams FOR SELECT USING (
  has_role(auth.uid(), 'designer') AND id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid())
);
CREATE POLICY "Developers can view their teams" ON public.teams FOR SELECT USING (
  has_role(auth.uid(), 'developer') AND id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid())
);
CREATE POLICY "Dev team leaders can view all teams" ON public.teams FOR SELECT USING (has_role(auth.uid(), 'development_team_leader'));
CREATE POLICY "Front Sales can view all teams" ON public.teams FOR SELECT USING (has_role(auth.uid(), 'front_sales'));

-- === team_members ===
CREATE POLICY "Admins and PMs can manage team members" ON public.team_members FOR ALL USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'project_manager'));
CREATE POLICY "Everyone can view team members" ON public.team_members FOR SELECT USING (auth.uid() IS NOT NULL);

-- === user_roles ===
CREATE POLICY "Users can view their own roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all roles" ON public.user_roles FOR SELECT USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can insert roles" ON public.user_roles FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can insert designer or developer role only" ON public.user_roles FOR INSERT WITH CHECK (auth.uid() = user_id AND role IN ('designer', 'developer'));
CREATE POLICY "PMs can view designer and developer roles" ON public.user_roles FOR SELECT USING (has_role(auth.uid(), 'project_manager') AND role IN ('designer', 'developer'));
CREATE POLICY "PMs can view front sales roles" ON public.user_roles FOR SELECT USING (has_role(auth.uid(), 'project_manager') AND role = 'front_sales');
CREATE POLICY "PMs can view project manager roles" ON public.user_roles FOR SELECT USING (has_role(auth.uid(), 'project_manager') AND role = 'project_manager');
CREATE POLICY "Front Sales can view designer and developer roles" ON public.user_roles FOR SELECT USING (has_role(auth.uid(), 'front_sales') AND role IN ('designer', 'developer'));
CREATE POLICY "Front Sales can view front sales roles" ON public.user_roles FOR SELECT USING (has_role(auth.uid(), 'front_sales') AND role = 'front_sales');
CREATE POLICY "Front Sales can view project manager roles" ON public.user_roles FOR SELECT USING (has_role(auth.uid(), 'front_sales') AND role = 'project_manager');

-- === availability_calendars ===
CREATE POLICY "Admins can manage calendars" ON public.availability_calendars FOR ALL USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "PMs can view calendars" ON public.availability_calendars FOR SELECT USING (has_role(auth.uid(), 'project_manager'));
CREATE POLICY "Developers can view calendars" ON public.availability_calendars FOR SELECT USING (has_role(auth.uid(), 'developer'));
CREATE POLICY "Dev team leaders can view calendars" ON public.availability_calendars FOR SELECT USING (has_role(auth.uid(), 'development_team_leader'));
CREATE POLICY "Front Sales can view calendars" ON public.availability_calendars FOR SELECT USING (has_role(auth.uid(), 'front_sales'));

-- === developers ===
CREATE POLICY "Admins can manage developers" ON public.developers FOR ALL USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "PMs can view developers" ON public.developers FOR SELECT USING (has_role(auth.uid(), 'project_manager'));
CREATE POLICY "Developers can view developers" ON public.developers FOR SELECT USING (has_role(auth.uid(), 'developer'));
CREATE POLICY "Dev team leaders can manage developers" ON public.developers FOR ALL USING (has_role(auth.uid(), 'development_team_leader')) WITH CHECK (has_role(auth.uid(), 'development_team_leader'));
CREATE POLICY "Front Sales can view developers" ON public.developers FOR SELECT USING (has_role(auth.uid(), 'front_sales'));

-- === tasks ===
CREATE POLICY "Admins can view all tasks" ON public.tasks FOR SELECT USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "PMs can view all tasks" ON public.tasks FOR SELECT USING (has_role(auth.uid(), 'project_manager'));
CREATE POLICY "PMs can create tasks" ON public.tasks FOR INSERT WITH CHECK (has_role(auth.uid(), 'project_manager') AND created_by = auth.uid());
CREATE POLICY "PMs can update their tasks" ON public.tasks FOR UPDATE
  USING (has_role(auth.uid(), 'project_manager') AND project_manager_id = auth.uid())
  WITH CHECK (has_role(auth.uid(), 'project_manager') AND (project_manager_id = auth.uid() OR (status = 'pending' AND reassigned_from = auth.uid() AND reassigned_at IS NOT NULL)));
CREATE POLICY "PMs can delete their pending tasks" ON public.tasks FOR DELETE USING (has_role(auth.uid(), 'project_manager') AND project_manager_id = auth.uid() AND status = 'pending');
CREATE POLICY "Designers can view tasks for their teams" ON public.tasks FOR SELECT USING (has_role(auth.uid(), 'designer') AND team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()));
CREATE POLICY "Designers can update task status" ON public.tasks FOR UPDATE
  USING (has_role(auth.uid(), 'designer') AND team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()))
  WITH CHECK (has_role(auth.uid(), 'designer') AND team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()));
CREATE POLICY "Developers can view tasks for their teams" ON public.tasks FOR SELECT USING (has_role(auth.uid(), 'developer') AND team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()));
CREATE POLICY "Developers can update task status" ON public.tasks FOR UPDATE
  USING (has_role(auth.uid(), 'developer') AND team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()))
  WITH CHECK (has_role(auth.uid(), 'developer') AND team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()));
CREATE POLICY "Dev team leaders can view all tasks" ON public.tasks FOR SELECT USING (has_role(auth.uid(), 'development_team_leader'));
CREATE POLICY "Dev team leaders can update tasks" ON public.tasks FOR UPDATE USING (has_role(auth.uid(), 'development_team_leader')) WITH CHECK (has_role(auth.uid(), 'development_team_leader'));
CREATE POLICY "Front Sales can view all tasks" ON public.tasks FOR SELECT USING (has_role(auth.uid(), 'front_sales'));
CREATE POLICY "Front Sales can create tasks" ON public.tasks FOR INSERT WITH CHECK (has_role(auth.uid(), 'front_sales') AND created_by = auth.uid());
CREATE POLICY "Front Sales can update tasks but not PM" ON public.tasks FOR UPDATE USING (has_role(auth.uid(), 'front_sales')) WITH CHECK (has_role(auth.uid(), 'front_sales'));
CREATE POLICY "Front Sales can delete pending tasks" ON public.tasks FOR DELETE USING (has_role(auth.uid(), 'front_sales') AND status = 'pending');

-- === design_submissions ===
CREATE POLICY "Admins can manage submissions" ON public.design_submissions FOR ALL USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Designers can insert submissions" ON public.design_submissions FOR INSERT WITH CHECK (has_role(auth.uid(), 'designer') AND designer_id = auth.uid());
CREATE POLICY "Designers can view team submissions" ON public.design_submissions FOR SELECT USING (
  has_role(auth.uid(), 'designer') AND task_id IN (SELECT id FROM tasks WHERE team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()))
);
CREATE POLICY "PMs can view all submissions" ON public.design_submissions FOR SELECT USING (has_role(auth.uid(), 'project_manager'));
CREATE POLICY "PMs can update submissions" ON public.design_submissions FOR UPDATE USING (has_role(auth.uid(), 'project_manager')) WITH CHECK (has_role(auth.uid(), 'project_manager'));
CREATE POLICY "Dev team leaders can view all submissions" ON public.design_submissions FOR SELECT USING (has_role(auth.uid(), 'development_team_leader'));
CREATE POLICY "Front Sales can view submissions" ON public.design_submissions FOR SELECT USING (has_role(auth.uid(), 'front_sales'));

-- === project_phases ===
CREATE POLICY "Admins can manage project phases" ON public.project_phases FOR ALL USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "PMs can view all project phases" ON public.project_phases FOR SELECT USING (has_role(auth.uid(), 'project_manager'));
CREATE POLICY "PMs can insert phases for their tasks" ON public.project_phases FOR INSERT WITH CHECK (has_role(auth.uid(), 'project_manager') AND task_id IN (SELECT id FROM tasks WHERE project_manager_id = auth.uid()));
CREATE POLICY "PMs can update phases for their tasks" ON public.project_phases FOR UPDATE
  USING (has_role(auth.uid(), 'project_manager') AND task_id IN (SELECT id FROM tasks WHERE project_manager_id = auth.uid()))
  WITH CHECK (has_role(auth.uid(), 'project_manager') AND task_id IN (SELECT id FROM tasks WHERE project_manager_id = auth.uid()));
CREATE POLICY "Developers can view own team phases" ON public.project_phases FOR SELECT USING (
  has_role(auth.uid(), 'developer') AND task_id IN (SELECT id FROM tasks WHERE team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()))
);
CREATE POLICY "Developers can insert phases for team tasks" ON public.project_phases FOR INSERT WITH CHECK (
  has_role(auth.uid(), 'developer') AND task_id IN (SELECT id FROM tasks WHERE team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()))
);
CREATE POLICY "Developers can update own team phases" ON public.project_phases FOR UPDATE
  USING (has_role(auth.uid(), 'developer') AND task_id IN (SELECT id FROM tasks WHERE team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid())))
  WITH CHECK (has_role(auth.uid(), 'developer') AND task_id IN (SELECT id FROM tasks WHERE team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid())));
CREATE POLICY "Dev team leaders can view all phases" ON public.project_phases FOR SELECT USING (has_role(auth.uid(), 'development_team_leader'));
CREATE POLICY "Dev team leaders can insert phases" ON public.project_phases FOR INSERT WITH CHECK (has_role(auth.uid(), 'development_team_leader'));
CREATE POLICY "Dev team leaders can update phases" ON public.project_phases FOR UPDATE USING (has_role(auth.uid(), 'development_team_leader')) WITH CHECK (has_role(auth.uid(), 'development_team_leader'));
CREATE POLICY "Front Sales can view project phases" ON public.project_phases FOR SELECT USING (has_role(auth.uid(), 'front_sales'));
CREATE POLICY "Front Sales can insert project phases" ON public.project_phases FOR INSERT WITH CHECK (has_role(auth.uid(), 'front_sales') AND task_id IN (SELECT id FROM tasks WHERE created_by = auth.uid()));
CREATE POLICY "Service role can manage project phases" ON public.project_phases FOR ALL USING ((auth.jwt() ->> 'role') = 'service_role') WITH CHECK ((auth.jwt() ->> 'role') = 'service_role');

-- === phase_reviews ===
CREATE POLICY "Admins can manage phase reviews" ON public.phase_reviews FOR ALL USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "PMs can view all phase reviews" ON public.phase_reviews FOR SELECT USING (has_role(auth.uid(), 'project_manager'));
CREATE POLICY "PMs can insert phase reviews for their tasks" ON public.phase_reviews FOR INSERT WITH CHECK (has_role(auth.uid(), 'project_manager') AND task_id IN (SELECT id FROM tasks WHERE project_manager_id = auth.uid()));
CREATE POLICY "PMs can update phase reviews for their tasks" ON public.phase_reviews FOR UPDATE
  USING (has_role(auth.uid(), 'project_manager') AND task_id IN (SELECT id FROM tasks WHERE project_manager_id = auth.uid()))
  WITH CHECK (has_role(auth.uid(), 'project_manager') AND task_id IN (SELECT id FROM tasks WHERE project_manager_id = auth.uid()));
CREATE POLICY "PMs can delete own pm_note reviews" ON public.phase_reviews FOR DELETE USING (has_role(auth.uid(), 'project_manager') AND reviewed_by = auth.uid() AND review_status = 'pm_note');
CREATE POLICY "Developers can view own team phase reviews" ON public.phase_reviews FOR SELECT USING (
  has_role(auth.uid(), 'developer') AND task_id IN (SELECT id FROM tasks WHERE team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()))
);
CREATE POLICY "Developers can update own team phase reviews" ON public.phase_reviews FOR UPDATE
  USING (has_role(auth.uid(), 'developer') AND task_id IN (SELECT id FROM tasks WHERE team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid())))
  WITH CHECK (has_role(auth.uid(), 'developer') AND task_id IN (SELECT id FROM tasks WHERE team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid())));
CREATE POLICY "Dev team leaders can view all phase reviews" ON public.phase_reviews FOR SELECT USING (has_role(auth.uid(), 'development_team_leader'));
CREATE POLICY "Dev team leaders can update phase reviews" ON public.phase_reviews FOR UPDATE USING (has_role(auth.uid(), 'development_team_leader')) WITH CHECK (has_role(auth.uid(), 'development_team_leader'));
CREATE POLICY "Front Sales can view phase reviews" ON public.phase_reviews FOR SELECT USING (has_role(auth.uid(), 'front_sales'));

-- === phase_review_replies ===
CREATE POLICY "Admins can manage all replies" ON public.phase_review_replies FOR ALL USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Dev team leaders can manage replies" ON public.phase_review_replies FOR ALL USING (has_role(auth.uid(), 'development_team_leader')) WITH CHECK (has_role(auth.uid(), 'development_team_leader'));
CREATE POLICY "PMs can view all replies" ON public.phase_review_replies FOR SELECT USING (has_role(auth.uid(), 'project_manager'));
CREATE POLICY "PMs can insert replies for their tasks" ON public.phase_review_replies FOR INSERT WITH CHECK (has_role(auth.uid(), 'project_manager') AND user_id = auth.uid() AND task_id IN (SELECT id FROM tasks WHERE project_manager_id = auth.uid()));
CREATE POLICY "PMs can update replies for their tasks" ON public.phase_review_replies FOR UPDATE
  USING (has_role(auth.uid(), 'project_manager') AND task_id IN (SELECT id FROM tasks WHERE project_manager_id = auth.uid()))
  WITH CHECK (has_role(auth.uid(), 'project_manager') AND task_id IN (SELECT id FROM tasks WHERE project_manager_id = auth.uid()));
CREATE POLICY "Developers can view replies for team tasks" ON public.phase_review_replies FOR SELECT USING (
  has_role(auth.uid(), 'developer') AND task_id IN (SELECT id FROM tasks WHERE team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()))
);
CREATE POLICY "Developers can insert replies for team tasks" ON public.phase_review_replies FOR INSERT WITH CHECK (
  has_role(auth.uid(), 'developer') AND user_id = auth.uid() AND task_id IN (SELECT id FROM tasks WHERE team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()))
);
CREATE POLICY "Developers can update replies for team tasks" ON public.phase_review_replies FOR UPDATE
  USING (has_role(auth.uid(), 'developer') AND task_id IN (SELECT id FROM tasks WHERE team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid())))
  WITH CHECK (has_role(auth.uid(), 'developer') AND task_id IN (SELECT id FROM tasks WHERE team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid())));

-- === order_messages ===
CREATE POLICY "Admins can manage order messages" ON public.order_messages FOR ALL USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "PMs can view order messages" ON public.order_messages FOR SELECT USING (has_role(auth.uid(), 'project_manager'));
CREATE POLICY "PMs can insert order messages" ON public.order_messages FOR INSERT WITH CHECK (has_role(auth.uid(), 'project_manager') AND sender_id = auth.uid());
CREATE POLICY "PMs can update order message status" ON public.order_messages FOR UPDATE USING (has_role(auth.uid(), 'project_manager')) WITH CHECK (has_role(auth.uid(), 'project_manager'));
CREATE POLICY "Designers can view team order messages" ON public.order_messages FOR SELECT USING (
  has_role(auth.uid(), 'designer') AND task_id IN (SELECT id FROM tasks WHERE team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()))
);
CREATE POLICY "Designers can insert team order messages" ON public.order_messages FOR INSERT WITH CHECK (
  has_role(auth.uid(), 'designer') AND sender_id = auth.uid() AND task_id IN (SELECT id FROM tasks WHERE team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()))
);
CREATE POLICY "Developers can view team order messages" ON public.order_messages FOR SELECT USING (
  has_role(auth.uid(), 'developer') AND task_id IN (SELECT id FROM tasks WHERE team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()))
);
CREATE POLICY "Developers can insert team order messages" ON public.order_messages FOR INSERT WITH CHECK (
  has_role(auth.uid(), 'developer') AND sender_id = auth.uid() AND task_id IN (SELECT id FROM tasks WHERE team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()))
);
CREATE POLICY "Dev team leaders can view all order messages" ON public.order_messages FOR SELECT USING (has_role(auth.uid(), 'development_team_leader'));
CREATE POLICY "Dev team leaders can insert order messages" ON public.order_messages FOR INSERT WITH CHECK (has_role(auth.uid(), 'development_team_leader') AND sender_id = auth.uid());

-- === order_message_reads ===
CREATE POLICY "Users can insert own read records" ON public.order_message_reads FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own read records" ON public.order_message_reads FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can view own read records" ON public.order_message_reads FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all read records" ON public.order_message_reads FOR SELECT USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Senders can view read receipts for their messages" ON public.order_message_reads FOR SELECT USING (message_id IN (SELECT id FROM order_messages WHERE sender_id = auth.uid()));

-- === message_reactions ===
CREATE POLICY "Users can add reactions" ON public.message_reactions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own reactions" ON public.message_reactions FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Users can view reactions" ON public.message_reactions FOR SELECT USING (message_id IN (SELECT id FROM order_messages));

-- === notifications ===
CREATE POLICY "Users can view their own notifications" ON public.notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update their own notifications" ON public.notifications FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can insert their own notifications" ON public.notifications FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Service role can insert notifications" ON public.notifications FOR INSERT WITH CHECK ((auth.jwt() ->> 'role') = 'service_role');

-- === task_delay_notifications ===
CREATE POLICY "Admins and PMs can view delay notifications" ON public.task_delay_notifications FOR SELECT USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'project_manager'));
CREATE POLICY "Front Sales can view delay notifications" ON public.task_delay_notifications FOR SELECT USING (has_role(auth.uid(), 'front_sales'));
CREATE POLICY "Service role can manage delay notifications" ON public.task_delay_notifications FOR ALL USING ((auth.jwt() ->> 'role') = 'service_role') WITH CHECK ((auth.jwt() ->> 'role') = 'service_role');

-- === task_hold_events ===
CREATE POLICY "Admins can manage hold events" ON public.task_hold_events FOR ALL USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "PMs can manage hold events" ON public.task_hold_events FOR ALL USING (has_role(auth.uid(), 'project_manager')) WITH CHECK (has_role(auth.uid(), 'project_manager'));
CREATE POLICY "Dev team leaders can view hold events" ON public.task_hold_events FOR SELECT USING (has_role(auth.uid(), 'development_team_leader'));
CREATE POLICY "Developers can view hold events for team tasks" ON public.task_hold_events FOR SELECT USING (
  has_role(auth.uid(), 'developer') AND task_id IN (SELECT id FROM tasks WHERE team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()))
);

-- === reassignment_history ===
CREATE POLICY "Admins can manage reassignment history" ON public.reassignment_history FOR ALL USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "PMs can view reassignment history" ON public.reassignment_history FOR SELECT USING (has_role(auth.uid(), 'project_manager'));
CREATE POLICY "Dev team leaders can view reassignment history" ON public.reassignment_history FOR SELECT USING (has_role(auth.uid(), 'development_team_leader'));
CREATE POLICY "Dev team leaders can insert reassignment history" ON public.reassignment_history FOR INSERT WITH CHECK (has_role(auth.uid(), 'development_team_leader'));
CREATE POLICY "Developers can view own reassignment history" ON public.reassignment_history FOR SELECT USING (
  has_role(auth.uid(), 'developer') AND task_id IN (SELECT id FROM tasks WHERE team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()))
);
CREATE POLICY "Service role can manage reassignment history" ON public.reassignment_history FOR ALL USING ((auth.jwt() ->> 'role') = 'service_role') WITH CHECK ((auth.jwt() ->> 'role') = 'service_role');

-- === leave_records ===
CREATE POLICY "Admins can manage leave records" ON public.leave_records FOR ALL USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "PMs can view leave records" ON public.leave_records FOR SELECT USING (has_role(auth.uid(), 'project_manager'));
CREATE POLICY "Dev team leaders can view leave records" ON public.leave_records FOR SELECT USING (has_role(auth.uid(), 'development_team_leader'));
CREATE POLICY "Developers can view own leave records" ON public.leave_records FOR SELECT USING (
  has_role(auth.uid(), 'developer') AND developer_id IN (SELECT id FROM developers WHERE user_id = auth.uid())
);

-- === sales_targets ===
CREATE POLICY "Admins can manage sales targets" ON public.sales_targets FOR ALL USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can view own targets" ON public.sales_targets FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Service role can manage sales targets" ON public.sales_targets FOR ALL USING ((auth.jwt() ->> 'role') = 'service_role') WITH CHECK ((auth.jwt() ->> 'role') = 'service_role');

-- === sales_performance_history ===
CREATE POLICY "Admins can view all history" ON public.sales_performance_history FOR SELECT USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Service role can manage history" ON public.sales_performance_history FOR ALL USING ((auth.jwt() ->> 'role') = 'service_role') WITH CHECK ((auth.jwt() ->> 'role') = 'service_role');

-- === website_order_assignment ===
CREATE POLICY "Admins and PMs can view assignment tracker" ON public.website_order_assignment FOR SELECT USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'project_manager'));
CREATE POLICY "Admins and PMs can update assignment tracker" ON public.website_order_assignment FOR UPDATE USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'project_manager'));
CREATE POLICY "Front Sales can view assignment tracker" ON public.website_order_assignment FOR SELECT USING (has_role(auth.uid(), 'front_sales'));
CREATE POLICY "Front Sales can update assignment tracker" ON public.website_order_assignment FOR UPDATE USING (has_role(auth.uid(), 'front_sales'));

-- ============================================================
-- 7. STORAGE
-- ============================================================

INSERT INTO storage.buckets (id, name, public) VALUES ('design-files', 'design-files', false);

-- Storage RLS policies
CREATE POLICY "Authenticated users can upload files"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'design-files' AND public.validate_safe_filename((storage.filename(name))));

CREATE POLICY "Authenticated users can read files"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'design-files');

CREATE POLICY "Authenticated users can update files"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'design-files');

-- ============================================================
-- 8. REALTIME
-- ============================================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE public.design_submissions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.project_phases;
ALTER PUBLICATION supabase_realtime ADD TABLE public.order_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.order_message_reads;
ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reactions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.phase_reviews;
ALTER PUBLICATION supabase_realtime ADD TABLE public.phase_review_replies;
ALTER PUBLICATION supabase_realtime ADD TABLE public.task_hold_events;

-- ============================================================
-- 9. AUTH TRIGGER (run separately if needed)
-- ============================================================
-- CREATE TRIGGER on_auth_user_created
--   AFTER INSERT ON auth.users
--   FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
