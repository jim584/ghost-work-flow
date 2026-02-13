-- Allow message senders to see who read their messages
CREATE POLICY "Senders can view read receipts for their messages"
ON public.order_message_reads
FOR SELECT
USING (
  message_id IN (
    SELECT id FROM public.order_messages WHERE sender_id = auth.uid()
  )
);
