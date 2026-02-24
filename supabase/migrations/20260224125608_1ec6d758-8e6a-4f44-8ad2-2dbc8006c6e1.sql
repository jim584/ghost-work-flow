
CREATE TABLE public.task_hold_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES public.tasks(id),
  event_type TEXT NOT NULL, -- 'hold' or 'resume'
  performed_by UUID NOT NULL,
  reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.task_hold_events ENABLE ROW LEVEL SECURITY;

-- Developers can view hold events for their team's tasks
CREATE POLICY "Developers can view hold events for team tasks"
  ON public.task_hold_events FOR SELECT
  USING (
    has_role(auth.uid(), 'developer'::app_role)
    AND task_id IN (
      SELECT t.id FROM tasks t
      WHERE t.team_id IN (
        SELECT tm.team_id FROM team_members tm WHERE tm.user_id = auth.uid()
      )
    )
  );

-- PMs can manage hold events for their tasks
CREATE POLICY "PMs can manage hold events"
  ON public.task_hold_events FOR ALL
  USING (has_role(auth.uid(), 'project_manager'::app_role))
  WITH CHECK (has_role(auth.uid(), 'project_manager'::app_role));

-- Admins can manage all hold events
CREATE POLICY "Admins can manage hold events"
  ON public.task_hold_events FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Dev team leaders can view all hold events
CREATE POLICY "Dev team leaders can view hold events"
  ON public.task_hold_events FOR SELECT
  USING (has_role(auth.uid(), 'development_team_leader'::app_role));

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.task_hold_events;
