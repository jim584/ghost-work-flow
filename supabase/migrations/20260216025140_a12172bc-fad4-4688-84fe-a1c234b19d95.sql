
-- Create table for developer replies to phase reviews
CREATE TABLE public.phase_review_replies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  phase_review_id UUID NOT NULL REFERENCES public.phase_reviews(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  message TEXT,
  voice_path TEXT,
  file_paths TEXT,
  file_names TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.phase_review_replies ENABLE ROW LEVEL SECURITY;

-- Developers can insert replies for their team's tasks
CREATE POLICY "Developers can insert replies for team tasks"
ON public.phase_review_replies FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'developer'::app_role) 
  AND user_id = auth.uid()
  AND task_id IN (
    SELECT t.id FROM tasks t
    WHERE t.team_id IN (
      SELECT tm.team_id FROM team_members tm WHERE tm.user_id = auth.uid()
    )
  )
);

-- Developers can view replies for their team's tasks
CREATE POLICY "Developers can view replies for team tasks"
ON public.phase_review_replies FOR SELECT
USING (
  has_role(auth.uid(), 'developer'::app_role) 
  AND task_id IN (
    SELECT t.id FROM tasks t
    WHERE t.team_id IN (
      SELECT tm.team_id FROM team_members tm WHERE tm.user_id = auth.uid()
    )
  )
);

-- Dev team leaders can insert and view all replies
CREATE POLICY "Dev team leaders can manage replies"
ON public.phase_review_replies FOR ALL
USING (has_role(auth.uid(), 'development_team_leader'::app_role))
WITH CHECK (has_role(auth.uid(), 'development_team_leader'::app_role));

-- PMs can view all replies
CREATE POLICY "PMs can view all replies"
ON public.phase_review_replies FOR SELECT
USING (has_role(auth.uid(), 'project_manager'::app_role));

-- Admins can manage all replies
CREATE POLICY "Admins can manage all replies"
ON public.phase_review_replies FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.phase_review_replies;
