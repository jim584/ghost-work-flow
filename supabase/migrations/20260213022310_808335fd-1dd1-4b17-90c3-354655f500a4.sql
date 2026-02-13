-- Add UPDATE policy so upsert works for order_message_reads
CREATE POLICY "Users can update own read records"
ON public.order_message_reads
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
