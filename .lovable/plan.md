

## Problem

Order 141 shows "Website Completed" badge because line 2286 checks `task.status === 'approved'` without verifying that all phases are actually approved. Phase 4 is still in progress, so the badge is wrong.

The categorization logic (lines 1581-1586) already correctly requires all phases to be approved -- so Order 141 won't appear in Awaiting Launch. But the **badge rendering** at line 2286 doesn't have the same guard.

## Fix

### 1. Badge rendering fix (`PMDashboard.tsx`, line 2286-2293)

Add phase verification to the `approved` status badge path, identical to the `completed` path:

```typescript
if (isWebsite && (task.status === 'approved') && !task.launch_website_live_at) {
  const taskPhases = (projectPhases || []).filter((p: any) => p.task_id === task.id);
  const allPhasesApproved = taskPhases.length > 0 && taskPhases.every((p: any) => p.review_status === 'approved');
  if (allPhasesApproved) {
    return (
      <Badge className="bg-blue-600 text-white shadow-sm">
        <Rocket className="h-3 w-3 mr-1" />
        Website Completed
      </Badge>
    );
  }
  // Has unreviewed phases - show awaiting review badge
  const hasPhaseAwaitingReview = taskPhases.some(
    (p: any) => (p.completed_at && !p.reviewed_at) ||
      (p.change_completed_at && (p.review_status === 'approved_with_changes' || p.review_status === 'disapproved_with_changes'))
  );
  if (hasPhaseAwaitingReview) {
    return (
      <Badge className="bg-green-500 text-white shadow-sm">
        Website Completed - Awaiting Final Review
      </Badge>
    );
  }
}
```

### 2. Data fix: Revert Order 141's status

Order 141 has Phase 4 still in progress -- its status should not be `approved`. Revert it to `in_progress`:

```sql
UPDATE tasks SET status = 'in_progress' WHERE task_number = 141;
```

Similarly, revert Order 143 (Phase 2 still awaiting review):

```sql
UPDATE tasks SET status = 'in_progress' WHERE task_number = 143;
```

This ensures:
- Website orders only show "Website Completed" when every phase is approved
- Orders with pending reviews stay in Priority View with "Awaiting Final Review"
- Database statuses reflect reality

