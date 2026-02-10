

## Fix: Multi-Team Orders Appearing in All Relevant Status Filters

### Problem
When a multi-team order has teams with different statuses (e.g., Team A is "pending" and Team B has "needs_revision"), clicking the "Pending" filter only shows orders where the **primary task** is pending. It does not check all teams in the group. This means the order only appears under one status filter instead of all applicable ones.

### Root Cause
In both `PMDashboard.tsx` and `AdminDashboard.tsx`, the filtering logic only uses `getGroupCategories()` for a few specific statuses (`recently_delivered`, `delayed`, `needs_revision`, `cancelled`). For `pending` and `in_progress`, it falls back to checking only `task.status` (the primary task), ignoring other teams in the group.

### Fix

**Files to modify**: `PMDashboard.tsx` and `AdminDashboard.tsx`

Update the status filter logic to use `getGroupCategories()` for **all** status filters, not just a subset. Change the filter condition from:

```
if (['recently_delivered', 'delayed', 'needs_revision', 'cancelled'].includes(statusFilter)) {
  const categories = getGroupCategories(group, submissions || []);
  return categories.includes(statusFilter);
}
return task.status === statusFilter;
```

To:

```
const categories = getGroupCategories(group, submissions || []);
return categories.includes(statusFilter);
```

This ensures that when any team within a multi-team order has a given status, the consolidated order card appears under that status filter. The badge displayed on the card will already adapt to match the active filter (this logic exists on line 1188).

### Scope
- Two files changed, ~3 lines modified per file
- No database changes needed
- No new components needed
