

## Make Unread Notes Badge Clickable → Opens Focused Notes Dialog

### Approach

Instead of opening the full "View Details" dialog, clicking the badge will open a lightweight, focused dialog showing **only the unread PM notes** for that task. On open, the notes get marked as read (with the existing 2-second delay pattern), and the badge disappears when the query refreshes.

### Implementation Steps

**File: `src/components/dashboards/DeveloperDashboard.tsx`**

1. **Add new state**: `const [unreadNotesTask, setUnreadNotesTask] = useState<any>(null);` — tracks which task's unread notes dialog is open.

2. **Make badge clickable**: Add `onClick` with `e.stopPropagation()` to the unread notes `<Badge>` (around line 1473) that sets `setUnreadNotesTask(task)` and adds `cursor-pointer` styling.

3. **Add a new focused Dialog** (after the View Details dialog, around line 2660):
   - Title: "Unread PM Notes - #\{task_number\}"
   - Content: Filter `phaseReviews` for `task_id === unreadNotesTask.id`, `review_status === "pm_note"`, `!dev_read_at`
   - Render each note with: phase number, reviewer name, timestamp, comment text, voice player (if any), file attachments (if any) — reusing the same rendering patterns already in `DevPhaseReviewTimeline`
   - On mount (useEffect): mark those notes as read by updating `dev_read_at` after 2-second delay, then invalidate the `developer-phase-reviews` query so the badge disappears

4. **Remove autoMarkRead from View Details**: The View Details dialog no longer needs to mark notes as read since that responsibility moves to this new focused dialog. (Keep `autoMarkRead` prop on the component for backwards compatibility but the View Details usage can set it to `false`.)

### Summary

- Badge becomes clickable with pointer cursor
- Click opens a small dialog with just the unread PM notes (grouped by phase)
- Notes are marked as read on viewing, badge disappears
- View Details dialog remains unchanged for full task info

