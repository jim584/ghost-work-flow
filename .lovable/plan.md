
# Fix: "Accepted" Badge Incorrectly Shown to Order Creator

## The Problem
When a PM creates an order but assigns a **different** PM, the "Accepted" badge still appears on the creator's dashboard. This happens because the current logic is:

```
(task.accepted_by_pm || task.created_by === user?.id)
```

The `task.created_by === user?.id` part was intended to auto-show "Accepted" for self-assigned orders, but it doesn't verify that the creator is also the assigned PM.

## The Fix
**File:** `src/components/dashboards/PMDashboard.tsx` (line 1492)

Update the condition to also check that the current user is the assigned project manager:

**Before:**
```
task.created_by === user?.id
```

**After:**
```
(task.created_by === user?.id && task.project_manager_id === user?.id)
```

This ensures the auto-accepted badge only appears when the PM both created **and** is assigned to the order. If they created it but assigned someone else, no badge will show on their view -- the assigned PM will see the "Accept Order" button instead.

## Technical Details
- **Single line change** in `src/components/dashboards/PMDashboard.tsx` at line 1492
- Change the condition from:
  `((task as any).accepted_by_pm || task.created_by === user?.id)`
  to:
  `((task as any).accepted_by_pm || (task.created_by === user?.id && task.project_manager_id === user?.id))`
- No database or migration changes needed
