-- Create enum for user roles
CREATE TYPE public.app_role AS ENUM ('admin', 'project_manager', 'designer');

-- Create enum for task status
CREATE TYPE public.task_status AS ENUM ('pending', 'in_progress', 'completed', 'approved');

-- Create user_roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id, role)
);

-- Create teams table
CREATE TABLE public.teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create team_members junction table
CREATE TABLE public.team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(team_id, user_id)
);

-- Create tasks table
CREATE TABLE public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_number SERIAL UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  project_manager_id UUID NOT NULL REFERENCES auth.users(id),
  status task_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create design_submissions table
CREATE TABLE public.design_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  designer_id UUID NOT NULL REFERENCES auth.users(id),
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  submitted_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.design_submissions ENABLE ROW LEVEL SECURITY;

-- Create security definer function to check user roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- RLS Policies for user_roles
CREATE POLICY "Users can view their own roles"
  ON public.user_roles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all roles"
  ON public.user_roles FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert roles"
  ON public.user_roles FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for teams
CREATE POLICY "Everyone can view teams"
  ON public.teams FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins and PMs can create teams"
  ON public.teams FOR INSERT
  WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR 
    public.has_role(auth.uid(), 'project_manager')
  );

CREATE POLICY "Admins and PMs can update teams"
  ON public.teams FOR UPDATE
  USING (
    public.has_role(auth.uid(), 'admin') OR 
    public.has_role(auth.uid(), 'project_manager')
  );

-- RLS Policies for team_members
CREATE POLICY "Everyone can view team members"
  ON public.team_members FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins and PMs can manage team members"
  ON public.team_members FOR ALL
  USING (
    public.has_role(auth.uid(), 'admin') OR 
    public.has_role(auth.uid(), 'project_manager')
  );

-- RLS Policies for tasks
CREATE POLICY "Admins can view all tasks"
  ON public.tasks FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "PMs can view their tasks"
  ON public.tasks FOR SELECT
  USING (
    public.has_role(auth.uid(), 'project_manager') AND 
    project_manager_id = auth.uid()
  );

CREATE POLICY "Designers can view tasks for their teams"
  ON public.tasks FOR SELECT
  USING (
    public.has_role(auth.uid(), 'designer') AND
    team_id IN (
      SELECT team_id FROM public.team_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "PMs can create tasks"
  ON public.tasks FOR INSERT
  WITH CHECK (
    public.has_role(auth.uid(), 'project_manager') AND
    project_manager_id = auth.uid()
  );

CREATE POLICY "PMs can update their tasks"
  ON public.tasks FOR UPDATE
  USING (
    public.has_role(auth.uid(), 'project_manager') AND
    project_manager_id = auth.uid()
  );

-- RLS Policies for design_submissions
CREATE POLICY "Admins can view all submissions"
  ON public.design_submissions FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "PMs can view submissions for their tasks"
  ON public.design_submissions FOR SELECT
  USING (
    public.has_role(auth.uid(), 'project_manager') AND
    task_id IN (
      SELECT id FROM public.tasks WHERE project_manager_id = auth.uid()
    )
  );

CREATE POLICY "Designers can view their own submissions"
  ON public.design_submissions FOR SELECT
  USING (
    public.has_role(auth.uid(), 'designer') AND
    designer_id = auth.uid()
  );

CREATE POLICY "Designers can create submissions"
  ON public.design_submissions FOR INSERT
  WITH CHECK (
    public.has_role(auth.uid(), 'designer') AND
    designer_id = auth.uid()
  );

-- Create storage bucket for design files
INSERT INTO storage.buckets (id, name, public)
VALUES ('design-files', 'design-files', false);

-- Storage policies for design files
CREATE POLICY "Designers can upload their designs"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'design-files' AND
    auth.uid() IS NOT NULL
  );

CREATE POLICY "Admins and PMs can view design files"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'design-files' AND
    (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'project_manager'))
  );

CREATE POLICY "Designers can view their own files"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'design-files' AND
    public.has_role(auth.uid(), 'designer')
  );

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_teams_updated_at
  BEFORE UPDATE ON public.teams
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_tasks_updated_at
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();