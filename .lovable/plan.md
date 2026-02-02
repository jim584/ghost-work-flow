

# Fix PM Task Reassignment with Status Restriction

## Overview
Update the RLS policy to allow Project Managers to reassign tasks to other PMs, but only while the task status is still 'pending'. Once the status changes (e.g., to 'in_progress'), only Admins can perform reassignments.

## Current Problem
The existing RLS policy blocks PM reassignment entirely because it requires `project_manager_id = auth.uid()` both before and after the update, preventing ownership transfer.

## Solution

### Database Migration
Replace the existing "PMs can update their tasks" policy with one that:
1. Allows regular updates where PM keeps ownership
2. Allows reassignment only when status = 'pending' and proper tracking fields are set

```sql
-- Drop the existing policy
DROP POLICY IF EXISTS "PMs can update their tasks" ON public.tasks;

-- Create updated policy with reassignment support
CREATE POLICY "PMs can update their tasks"
ON public.tasks
FOR UPDATE
USING (
  has_role(auth.uid(), 'project_manager'::app_role) 
  AND project_manager_id = auth.uid()
)
WITH CHECK (
  has_role(auth.uid(), 'project_manager'::app_role) 
  AND (
    -- Regular updates: PM keeps ownership
    project_manager_id = auth.uid()
    OR
    -- Reassignment: Only allowed when status is pending
    (
      status = 'pending'::task_status
      AND reassigned_from = auth.uid() 
      AND reassigned_at IS NOT NULL
    )
  )
);
```

## Business Rules Summary

| Scenario | PM Can Reassign? | Admin Can Reassign? |
|----------|------------------|---------------------|
| Status = pending | Yes | Yes |
| Status = in_progress | No | Yes |
| Status = completed | No | Yes |

## No Frontend Changes Required
The existing reassignment UI in PMDashboard already:
- Only shows the reassign option for pending tasks
- Sets `reassigned_from`, `reassigned_at`, and `reassignment_reason` correctly

