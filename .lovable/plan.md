

## Add "Unread PM Notes" Indicator on Developer Dashboard

### Problem
When a PM adds notes to an order's phase, the developer has no visual cue on their dashboard that new notes exist and need attention. They'd only discover notes by manually expanding each order's phase accordion.

### Solution
Add a small red dot/badge on order cards in the Developer Dashboard whenever there are unread PM notes, so developers immediately know which orders have new notes to check.

### Changes Required

**1. Database: Add `dev_read_at` column to `phase_reviews` table**

A new nullable timestamp column `dev_read_at` on the `phase_reviews` table will track when a developer has seen/read each PM note. It stays `NULL` until the developer views the note.

- Migration: `ALTER TABLE phase_reviews ADD COLUMN dev_read_at timestamptz DEFAULT NULL;`

**2. File: `src/components/dashboards/DeveloperDashboard.tsx`**

- **Unread notes count**: For each task/order card, count `phase_reviews` entries where `review_status = 'pm_note'` AND `dev_read_at IS NULL`. If count > 0, show a small red badge (e.g., a red circle with a number or a "New Notes" badge) next to the order number or title on the card.

- **Mark notes as read**: When the developer expands the phase timeline (clicks on the order or opens the accordion), automatically mark all unread PM notes for that task as read by updating `dev_read_at = now()` on those records.

**3. File: `src/components/dashboards/DevPhaseReviewTimeline.tsx`**

- When the timeline component mounts or becomes visible for a task, trigger the "mark as read" update for all PM notes belonging to that task's phases.

### Visual Design

On the order card header (near the existing badges like "NEW", "DELAYED", etc.), a new badge will appear:

- Red/pink badge with a small icon: "X unread note(s)" -- only visible when there are unread PM notes
- Once the developer expands the order and views the timeline, the badge disappears

### Technical Detail

- New DB column: `phase_reviews.dev_read_at` (timestamptz, nullable)
- Query for unread count: filter `phaseReviews` array client-side where `review_status === "pm_note" && !dev_read_at && task_id === task.id`
- Mark-as-read mutation: `UPDATE phase_reviews SET dev_read_at = now() WHERE task_id = X AND review_status = 'pm_note' AND dev_read_at IS NULL`
- RLS: The existing policies on `phase_reviews` should cover this since developers can already read these records; an update policy allowing developers to set `dev_read_at` on their task's reviews will be added if needed
- The phaseReviews query already fetches all reviews for developer tasks, so no additional query is needed -- just add `dev_read_at` to the select

