

## Problem

Order 142 has the exact same issue as Order 151. All 2 phases are approved, but the auto-promotion logic (before our recent fix) set the status directly to `approved`, skipping `completed`. The "Launch Website" button only renders when `task.status === "completed"`, so it never appears.

```text
Order 142:  status = 'approved',  all phases approved,  launch_website_live_at = null
            → "Launch Website" button requires status === "completed" → button hidden
```

## Fix

### Data fix only — no code changes needed

The auto-promotion code was already fixed in the previous change (line 770-773 now sets website tasks to `completed` instead of `approved`). Order 142 just needs its status corrected in the database:

```sql
UPDATE tasks SET status = 'completed' WHERE task_number = 142;
```

This will make the "Launch Website" button appear, allowing the PM to enter domain/hosting details and complete the launch workflow (which then sets status to `approved`).

