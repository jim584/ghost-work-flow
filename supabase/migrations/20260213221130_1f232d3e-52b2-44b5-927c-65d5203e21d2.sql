
-- Create reassignment history table
CREATE TABLE public.reassignment_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  from_developer_id UUID REFERENCES public.developers(id),
  to_developer_id UUID NOT NULL REFERENCES public.developers(id),
  reason TEXT NOT NULL,
  reassigned_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.reassignment_history ENABLE ROW LEVEL SECURITY;

-- Admins can do everything
CREATE POLICY "Admins can manage reassignment history"
ON public.reassignment_history FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Dev team leaders can view and insert
CREATE POLICY "Dev team leaders can view reassignment history"
ON public.reassignment_history FOR SELECT
USING (has_role(auth.uid(), 'development_team_leader'::app_role));

CREATE POLICY "Dev team leaders can insert reassignment history"
ON public.reassignment_history FOR INSERT
WITH CHECK (has_role(auth.uid(), 'development_team_leader'::app_role));

-- PMs can view
CREATE POLICY "PMs can view reassignment history"
ON public.reassignment_history FOR SELECT
USING (has_role(auth.uid(), 'project_manager'::app_role));

-- Developers can view their own task history
CREATE POLICY "Developers can view own reassignment history"
ON public.reassignment_history FOR SELECT
USING (
  has_role(auth.uid(), 'developer'::app_role) AND (
    task_id IN (
      SELECT id FROM tasks WHERE team_id IN (
        SELECT team_id FROM team_members WHERE user_id = auth.uid()
      )
    )
  )
);

-- Service role can manage
CREATE POLICY "Service role can manage reassignment history"
ON public.reassignment_history FOR ALL
USING ((auth.jwt() ->> 'role'::text) = 'service_role'::text)
WITH CHECK ((auth.jwt() ->> 'role'::text) = 'service_role'::text);
