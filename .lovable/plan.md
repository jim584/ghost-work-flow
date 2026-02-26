

## Make Unread Reply Badge Clickable — Open Specific Phase Accordion

### What happens today
The "X new replies" badge on developer task cards is static (not clickable). Unread PM replies are fetched but don't include `phase_review_id`, so there's no way to know which phase they belong to.

### Proposed Changes

**1. Fetch phase context with replies**
In the unread PM replies query (`DeveloperDashboard.tsx`), also select `phase_review_id`. Then join against `phaseReviews` data to resolve which `phase_id` each reply belongs to, giving us the phase numbers to display on the badge (like the unread notes badge already does).

**2. Make the reply badge clickable**
Add `cursor-pointer`, `onClick` with `e.stopPropagation()`. The badge text will show phase numbers, e.g. "2 new replies (Phase 1, 3)".

**3. On click: expand the task card and open the phase accordion**
- Add new state: `scrollToReplyPhase: { taskId: string; phaseId: string } | null`
- On badge click: set `expandedTaskId` to the task, and set `scrollToReplyPhase` to the first phase with unread replies
- Pass a new `defaultOpenPhaseId` prop to `DevPhaseReviewTimeline` — when set, the component renders that phase's accordion as open by default so the developer lands directly on the relevant phase

**4. Mark replies as read**
Add a "Mark as Read" button inside the reply section (similar to the unread notes pattern). On click, update `dev_read_at` for all unread replies on that task, invalidate `developer-unread-replies` query, and show a toast.

**5. Show "Replies Read" in the timeline**
In `DevPhaseReviewTimeline.tsx`, add timeline events for replies that have `dev_read_at` set — similar to the existing "Notes Read" events. Show developer name, phase number, and timestamp in both grouped and chronological views.

### Files to modify
- `src/components/dashboards/DeveloperDashboard.tsx` — query update, clickable badge, scroll state, mark-as-read logic
- `src/components/dashboards/DevPhaseReviewTimeline.tsx` — accept `defaultOpenPhaseId` prop, add "Replies Read" timeline events
- `src/components/dashboards/PhaseReviewReplySection.tsx` — add "Mark as Read" button for unread replies

### Technical detail
- The reply query adds `phase_review_id` to the select. Phase mapping is done client-side by joining `phase_review_id` against the already-fetched `phaseReviews` to get `phase_id`, then against `projectPhases` to get `phase_number`.
- The `DevPhaseReviewTimeline` active phase accordion currently uses `<Accordion type="single" collapsible>` without a controlled `value`. Adding a `defaultValue` prop set to the target phase ID will auto-expand it on render.

