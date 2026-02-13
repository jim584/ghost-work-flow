
-- Create message reactions table
CREATE TABLE public.message_reactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id UUID NOT NULL REFERENCES public.order_messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  emoji TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(message_id, user_id, emoji)
);

-- Enable RLS
ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;

-- Users can view reactions on messages they can see
CREATE POLICY "Users can view reactions" ON public.message_reactions
  FOR SELECT USING (
    message_id IN (SELECT id FROM public.order_messages)
  );

-- Users can add their own reactions
CREATE POLICY "Users can add reactions" ON public.message_reactions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can remove their own reactions
CREATE POLICY "Users can delete own reactions" ON public.message_reactions
  FOR DELETE USING (auth.uid() = user_id);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reactions;
