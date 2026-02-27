

## Problem

In both `getTaskCategory` and `getGroupCategories`, the `awaiting_launch` detection for website orders with `status === 'approved'` blindly trusts the task status without verifying that all phases are actually approved. Order 143 has `status = 'approved'` but Phase 2 is still awaiting review (`reviewed_at = null`, `review_status = null`).

## Fix

### File: `src/components/dashboards/PMDashboard.tsx`

**1. Update `getTaskCategory` (~line 1583-1584)**
Change the `status === 'approved'` check to also verify all phases have `review_status === 'approved'`:

```typescript
if (task.status === 'approved') {
  const taskPhases = (projectPhases || []).filter((p: any) => p.task_id === task.id);
  const allPhasesApproved = taskPhases.length > 0 && taskPhases.every((p: any) => p.review_status === 'approved');
  if (allPhasesApproved) return 'awaiting_launch';
}
```

**2. Update `getGroupCategories` (~line 1502-1510)**
Same fix — when `status === 'approved'`, also verify all phases are approved before including in `awaiting_launch`:

```typescript
const hasAwaitingLaunch = activeTasks.some((t: any) => {
  if (t.post_type !== 'Website Design' || t.launch_website_live_at) return false;
  const taskPhases = (projectPhases || []).filter((p: any) => p.task_id === t.id);
  const allPhasesApproved = taskPhases.length > 0 && taskPhases.every((p: any) => p.review_status === 'approved');
  if ((t.status === 'approved' || t.status === 'completed') && allPhasesApproved) return true;
  return false;
});
```

This consolidates both the `approved` and `completed` paths into one check that always verifies phase-level approval.

### Data consideration
Order 143's task status is `approved` but it shouldn't be — it still has unreviewed phases. The code fix above will prevent it from appearing in Awaiting Launch regardless. However, you may also want to revert Order 143's status back to `in_progress` or `completed` in the database so it shows correctly elsewhere.

