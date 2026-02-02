-- Drop the policy that allows users to view their own history
DROP POLICY IF EXISTS "Users can view their own history" ON public.sales_performance_history;