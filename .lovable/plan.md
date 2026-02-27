

## Problem

Order 151 is stuck in "All Tasks" instead of the Priority View because the PM dashboard's "awaiting review" detection only checks `completed_at && !reviewed_at`. After a revision cycle, `reviewed_at` is already set from the initial PM review, so the check fails — even though the developer has submitted revised changes that the PM hasn't re-reviewed yet.

**Phase 6 data confirms this:**
- `reviewed_at` = set (PM reviewed with changes)
- `review_status` = `approved_with_changes`
- `change_completed_at` = set (dev completed the changes)
- PM has NOT re-reviewed → but the system thinks it's already reviewed

## Root Cause

The `hasPhaseAwaitingReview` check at two locations uses:
```
p.completed_at && !p.reviewed_at
```
This misses the case where changes were completed and need re-review. `reviewed_at` is non-null from the first review round.

## Fix

Update `hasPhaseAwaitingReview` in **two places** in `PMDashboard.tsx` to also detect phases with completed revisions awaiting re-review:

**1. Single-task categorization (~line 1529)**
**2. Group-level categorization (~line 1458)**

Add this condition alongside the existing one:
```typescript
// Existing: initial submission not yet reviewed
(p.completed_at && !p.reviewed_at) ||
// New: changes completed but PM hasn't re-approved yet
(p.change_completed_at && (p.review_status === 'approved_with_changes' || p.review_status === 'disapproved_with_changes'))
```

This ensures that when a developer marks revision changes as done, the order returns to the Priority View under "Recently Delivered" — and since the task status is `completed`, the badge will correctly show **"Website Completed - Awaiting Final Review"**.

## Files to modify
- `src/components/dashboards/PMDashboard.tsx`
  - Line ~1529: Update `hasPhaseAwaitingReview` in `getPriorityCategory`
  - Line ~1458: Update `hasPhaseAwaitingReview` in `getGroupCategories`

No database changes needed — Order 151's data is correct; only the detection logic is wrong.

