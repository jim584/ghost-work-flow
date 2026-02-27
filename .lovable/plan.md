

## Problem

Order 151 has all 6 phases approved. The auto-promotion logic (line 768-772) sets the task status directly to `approved` when all phases are approved. But the "Launch Website" button (line 2928) only renders when `task.status === "completed"`. So the button never appears -- the order skipped the `completed` state entirely.

```text
Current flow:    in_progress → approved (skips "completed")
                                ↑ Launch Website button requires "completed" — never shows

Correct flow:    in_progress → completed → [PM clicks Launch Website] → approved
```

## Fix

### 1. Auto-promotion logic (`PMDashboard.tsx`, ~line 768-772)

Change the auto-promotion to set status to `completed` instead of `approved` for website orders. The `approved` state should only be reached after the PM completes the launch workflow.

```typescript
if (allPhasesApproved) {
  const isWebsiteTask = tasks?.find(t => t.id === taskId)?.post_type === 'Website Design';
  await supabase
    .from("tasks")
    .update({ status: (isWebsiteTask ? "completed" : "approved") as any })
    .eq("id", taskId);
}
```

### 2. Data fix: Revert Order 151

Order 151 is currently `approved` but needs to be `completed` so the Launch Website button appears:

```sql
UPDATE tasks SET status = 'completed' WHERE task_number = 151;
```

### 3. Badge rendering already handles this

The existing badge logic at line 2259 already handles `status === 'completed'` with all phases approved -- it shows the "Website Completed" badge. The "Launch Website" button will also appear since it checks for `status === "completed"`. No badge changes needed.

