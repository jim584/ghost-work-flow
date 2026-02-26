

## Fix: Hide "Uploaded Files" expand arrow for website orders with phases in Team Overview Dashboard

### Problem
In `TeamOverviewDashboard.tsx`, the expand chevron (line 1230) and "Uploaded Files" section (line 1283) are shown for **all** tasks with submissions, including website orders that have phase data. This was already fixed in `DeveloperDashboard.tsx` by adding the guard `!(projectPhases?.some(p => p.task_id === task.id))`, but the same guard is missing in the Team Overview dashboard.

### Changes

**File: `src/components/dashboards/TeamOverviewDashboard.tsx`**

1. **Line 1230** — Add phase guard to the expand button:
   - Change `{taskSubmissions.length > 0 && (` to `{taskSubmissions.length > 0 && !(phases?.some(p => p.task_id === task.id)) && (`

2. **Line 1283** — Add phase guard to the expanded content:
   - Change `{isExpanded && taskSubmissions.length > 0 && (` to `{isExpanded && taskSubmissions.length > 0 && !(phases?.some(p => p.task_id === task.id)) && (`

This ensures the old file-based "Uploaded Files" section is hidden for website orders that use the phase-based submission timeline, matching the behavior already implemented in the Developer Dashboard.

