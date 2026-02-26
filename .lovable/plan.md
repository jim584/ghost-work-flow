

## Change Unread Notes Dialog: Manual "Mark as Read" Button

### Current Behavior
Notes are automatically marked as read after a 2-second delay when the focused dialog opens.

### Proposed Change
Replace the auto-mark logic with a explicit "Mark as Read" button inside the dialog. The badge only disappears when the developer deliberately clicks the button.

### Implementation Steps

**File: `src/components/dashboards/DeveloperDashboard.tsx`**

1. **Remove the `UnreadNotesMarker` component** (or its auto-mark `useEffect`) — no more 2-second auto-read.

2. **Add a "Mark as Read" button** in the dialog footer:
   - On click: update `dev_read_at = now()` for all unread `pm_note` reviews for that task, invalidate `developer-phase-reviews` query, then close the dialog.
   - Show a loading state while the update runs.

3. **Also update the View Details dialog** — remove `autoMarkRead` usage there too, since notes should only be cleared via the explicit button in the focused dialog.

