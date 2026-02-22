

## Remove Old Expandable "Your Uploaded Files" Section for All Task Statuses

### Problem
The phase submission flow writes the same data (URLs, comments, files) to **both** the `design_submissions` table and the `project_phases` table. This means:
- The **old expandable section** (chevron button showing "Your Uploaded Files") displays `design_submissions` data
- The **DevPhaseReviewTimeline** displays `project_phases` data

Both show the exact same URLs, comments, and files -- just in different UI formats. The timeline is the better, more consistent UI. The old expandable is redundant for **all** task statuses, not just completed/approved.

### Solution
Remove the status condition we just added and instead **hide the old expandable section entirely** for website orders that have phase data (since those always have the timeline). This means:
- Remove the expand chevron button for tasks that have phases (the timeline already shows everything)
- Remove the expanded "Your Uploaded Files" panel for those same tasks

### What Changes

**File: `src/components/dashboards/DeveloperDashboard.tsx`**

1. **Line ~1955 (expand button):** Change the condition from checking `completed`/`approved` status to checking whether the task has phase data. If phases exist, hide the button entirely since the timeline covers it. If no phases exist (e.g., pure logo orders), keep showing the button.

2. **Line ~2006 (expanded panel):** Same condition change -- only show "Your Uploaded Files" for tasks without phase data.

The condition will be something like:
```
taskSubmissions.length > 0 && !(projectPhases?.some(p => p.task_id === task.id))
```

This way:
- **Website orders (with phases):** Only show the DevPhaseReviewTimeline -- no duplicate
- **Logo orders (without phases):** Keep showing the old expandable since they don't have a timeline
