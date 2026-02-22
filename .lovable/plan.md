
## Remove Duplicate Expandable Section for Completed Website Orders

### Problem
For completed/approved website orders, there are now two ways to see submission details:
1. The **new** `DevPhaseReviewTimeline` (added in the last change) -- shows full phase timeline with URLs, comments, and files inline on the card
2. The **old** expandable section (chevron button to the right of the status badge) -- shows "Your Uploaded Files" with the same comments/submissions

This is redundant. The old expandable section should be removed for completed/approved tasks since the `DevPhaseReviewTimeline` already displays all the same information in a better, more consistent format.

### Plan

**Single change in `DeveloperDashboard.tsx`:**

1. **Hide the old expand button for completed/approved tasks** (around line 1955): Add a condition so the chevron expand button only shows when the task is NOT completed or approved. The timeline already covers those statuses.

2. **Hide the old "Your Uploaded Files" section for completed/approved tasks** (around line 2006): Add a condition so the expandable submissions panel only renders when the task is NOT completed or approved.

This way:
- **In-progress / assigned tasks** keep the old expand button (if they still need it for the `design_submissions` view)
- **Completed / approved tasks** only show the `DevPhaseReviewTimeline` -- no duplicate

### Technical Details

- File: `src/components/dashboards/DeveloperDashboard.tsx`
- Line ~1955: Wrap the expand button in `task.status !== "completed" && task.status !== "approved"`
- Line ~2006: Wrap the expanded submissions panel in the same condition
