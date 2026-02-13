
-- Create order_messages table
CREATE TABLE public.order_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL,
  message text NOT NULL,
  file_path text,
  file_name text,
  parent_message_id uuid REFERENCES public.order_messages(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT order_messages_status_check CHECK (status IN ('pending', 'resolved'))
);

-- Create order_message_reads table
CREATE TABLE public.order_message_reads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.order_messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  read_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(message_id, user_id)
);

-- Enable RLS
ALTER TABLE public.order_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_message_reads ENABLE ROW LEVEL SECURITY;

-- RLS for order_messages

-- Admins: full access
CREATE POLICY "Admins can manage order messages"
ON public.order_messages FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- PMs: SELECT all, INSERT own, UPDATE status
CREATE POLICY "PMs can view order messages"
ON public.order_messages FOR SELECT
USING (has_role(auth.uid(), 'project_manager'::app_role));

CREATE POLICY "PMs can insert order messages"
ON public.order_messages FOR INSERT
WITH CHECK (has_role(auth.uid(), 'project_manager'::app_role) AND sender_id = auth.uid());

CREATE POLICY "PMs can update order message status"
ON public.order_messages FOR UPDATE
USING (has_role(auth.uid(), 'project_manager'::app_role))
WITH CHECK (has_role(auth.uid(), 'project_manager'::app_role));

-- Developers: SELECT/INSERT on their team's tasks
CREATE POLICY "Developers can view team order messages"
ON public.order_messages FOR SELECT
USING (has_role(auth.uid(), 'developer'::app_role) AND task_id IN (
  SELECT id FROM tasks WHERE team_id IN (
    SELECT team_id FROM team_members WHERE user_id = auth.uid()
  )
));

CREATE POLICY "Developers can insert team order messages"
ON public.order_messages FOR INSERT
WITH CHECK (has_role(auth.uid(), 'developer'::app_role) AND sender_id = auth.uid() AND task_id IN (
  SELECT id FROM tasks WHERE team_id IN (
    SELECT team_id FROM team_members WHERE user_id = auth.uid()
  )
));

-- Designers: SELECT/INSERT on their team's tasks
CREATE POLICY "Designers can view team order messages"
ON public.order_messages FOR SELECT
USING (has_role(auth.uid(), 'designer'::app_role) AND task_id IN (
  SELECT id FROM tasks WHERE team_id IN (
    SELECT team_id FROM team_members WHERE user_id = auth.uid()
  )
));

CREATE POLICY "Designers can insert team order messages"
ON public.order_messages FOR INSERT
WITH CHECK (has_role(auth.uid(), 'designer'::app_role) AND sender_id = auth.uid() AND task_id IN (
  SELECT id FROM tasks WHERE team_id IN (
    SELECT team_id FROM team_members WHERE user_id = auth.uid()
  )
));

-- Dev team leaders: SELECT/INSERT all
CREATE POLICY "Dev team leaders can view all order messages"
ON public.order_messages FOR SELECT
USING (has_role(auth.uid(), 'development_team_leader'::app_role));

CREATE POLICY "Dev team leaders can insert order messages"
ON public.order_messages FOR INSERT
WITH CHECK (has_role(auth.uid(), 'development_team_leader'::app_role) AND sender_id = auth.uid());

-- RLS for order_message_reads

-- Users can insert their own read records
CREATE POLICY "Users can insert own read records"
ON public.order_message_reads FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can view their own read records
CREATE POLICY "Users can view own read records"
ON public.order_message_reads FOR SELECT
USING (auth.uid() = user_id);

-- Admins can view all read records
CREATE POLICY "Admins can view all read records"
ON public.order_message_reads FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Enable realtime on order_messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.order_messages;

-- Add 'order_message' to notification type constraint
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check 
CHECK (type IN ('new_task', 'revision_requested', 'task_delayed', 'file_uploaded', 'order_cancelled', 'late_acknowledgement', 'reassignment_requested', 'order_message'));
