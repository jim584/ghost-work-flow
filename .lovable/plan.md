

# Fix: Show Launched Website Tasks in Developer Active View

## Problem

When a PM fills out the Launch Website form, the task status changes to `approved`. However, the Developer Dashboard's "active" filter only includes tasks with status `assigned`, `pending`, or `in_progress` (plus those needing revision). Tasks with `approved` status are excluded, so the developer cannot see them in their active/working view.

This means order 146 (and any launched website task) vanishes from the developer's active view precisely when they need to act on it -- handling domain/hosting prerequisites and marking the website live.

## Solution

Update the "active" filter in the Developer Dashboard to also include `approved` tasks that have NOT yet been marked live (i.e., `launch_website_live_at` is null). This ensures launched website orders remain visible to the developer until the website is live.

## Technical Details

### File: `src/components/dashboards/DeveloperDashboard.tsx`

**Change the active filter** (around line 1102):

Current:
```typescript
if (statusFilter === "active") {
  return task.status === "assigned" ||
    task.status === "pending" ||
    task.status === "in_progress" ||
    tasksNeedingRevision.some(t => t.id === task.id);
}
```

Updated:
```typescript
if (statusFilter === "active") {
  return task.status === "assigned" ||
    task.status === "pending" ||
    task.status === "in_progress" ||
    tasksNeedingRevision.some(t => t.id === task.id) ||
    (task.status === "approved" && !task.launch_website_live_at);
}
```

This single-line addition ensures that `approved` website tasks waiting to be marked live appear in the developer's active view, while already-live tasks (with a `launch_website_live_at` timestamp) remain excluded.

**No database changes needed** -- this is purely a frontend filtering fix.

