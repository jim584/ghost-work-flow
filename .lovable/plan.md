

## Fix: Auto-revert task status when all phases are completed after revision

### Problem
Order 151 shows "Phase 6 In Progress" even though all 6 phases are completed. Two issues:
1. `total_phases` is `NULL` for this task, so the existing auto-revert check (`current_phase === total_phases`) never triggers
2. The `getStatusLabel` function blindly shows "Phase X in Progress" for any `in_progress` task, even when all phases are submitted

### Fix

**1. Improve auto-revert logic in `handleMarkPhaseComplete` (line ~477)**
Instead of relying solely on `total_phases`, also check if ALL project phases for the task have `completed_at` set. This handles cases where `total_phases` was never populated:

```typescript
// After existing check, add fallback: query all phases for this task
const { data: allPhases } = await supabase
  .from("project_phases")
  .select("completed_at")
  .eq("task_id", phaseData.task_id);
const allPhasesCompleted = allPhases && allPhases.length > 0 && allPhases.every(p => p.completed_at);
if (allPhasesCompleted && taskData.status === 'in_progress') {
  await supabase.from("tasks").update({ status: 'completed' }).eq("id", taskData.id);
}
```

**2. Update `getStatusLabel` (line ~1173)**
When status is `in_progress`, check if the current phase already has `completed_at`. If all phases are submitted, show "Website Complete" instead of "Phase X in Progress".

**3. Fix Order 151 data**
Update order 151's status to `completed` since all 6 phases are already submitted.

### Files to modify
- `src/components/dashboards/DeveloperDashboard.tsx`
  - Line ~477: Improve auto-revert to check all phases have `completed_at` as fallback
  - Line ~1173: Update `getStatusLabel` to account for already-submitted phases
- Database: Update task 151 status to `completed`

