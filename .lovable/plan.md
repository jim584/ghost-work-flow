

## Problem

Order 151 doesn't appear in "Awaiting Launch" because the phase approval logic in `PMDashboard.tsx` (lines 730-757) never auto-promotes the task status from `completed` to `approved` when all phases are approved. The auto-promotion exists for design submissions but is missing for website phases.

## Plan

### File: `src/components/dashboards/PMDashboard.tsx`

**Add auto-promotion logic after phase approval (~line 757, after updating the phase)**

After a phase is approved, query all phases for that task. If every phase has `review_status === 'approved'`, update the task status to `'approved'`. This mirrors the existing design submission auto-promotion logic at lines 551-571.

```typescript
// After phase update succeeds (~line 757):
// Check if ALL phases for this task are now approved
const { data: allPhases } = await supabase
  .from("project_phases")
  .select("id, review_status")
  .eq("task_id", taskId);

const allPhasesApproved = allPhases && allPhases.length > 0 
  && allPhases.every(p => p.review_status === 'approved');

if (allPhasesApproved) {
  await supabase
    .from("tasks")
    .update({ status: "approved" as any })
    .eq("id", taskId);
}
```

This single change will:
- Auto-promote website tasks to `approved` when the last phase is approved
- Make them automatically appear in the "Awaiting Launch" section
- Show the "Website Completed" badge
- Show the "Launch Website" button

No other files need changes.

