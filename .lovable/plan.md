

## Add "New Developer Reply" Indicator on PM Order Cards

### Problem
When a developer replies to a PM's note or review, the PM has no visual indicator on their dashboard. They'd only discover replies by manually expanding each order and checking the phase review section.

### Solution
Add a small red badge on PM order cards showing unread developer replies, similar to the "unread notes" indicator we added for developers.

### Changes Required

**1. Database: Add `pm_read_at` column to `phase_review_replies` table**

A new nullable timestamp column on `phase_review_replies` to track when the PM has seen each developer reply. Stays `NULL` until the PM views the reply.

- Migration: `ALTER TABLE phase_review_replies ADD COLUMN pm_read_at timestamptz DEFAULT NULL;`
- RLS: Add an UPDATE policy for PMs so they can set `pm_read_at` on replies for their tasks.

**2. File: `src/components/dashboards/PMDashboard.tsx`**

- Fetch `phase_review_replies` for all PM tasks (or add to existing query).
- For each order card, count replies where `pm_read_at IS NULL`.
- If count > 0, show a small red badge on the card header (line ~1941, near existing badges like "On Hold", "Delayed") saying something like: a red dot with "X new reply/replies".

**3. File: `src/components/dashboards/PhaseReviewReplySection.tsx`**

- When the reply section mounts/becomes visible for a PM user, mark all unread replies as read by updating `pm_read_at = now()` on those records.
- This auto-clears the badge when the PM expands the order and views the replies.

### Visual Design

On the order card header (near existing badges), a new badge will appear:
- Small red/pink badge: "X new reply/replies" -- only visible when there are unread developer replies
- Once the PM expands the order and views the phase review section, the badge disappears

### Technical Detail

- New DB column: `phase_review_replies.pm_read_at` (timestamptz, nullable)
- New RLS policy: PMs can UPDATE `phase_review_replies` for their tasks (to set `pm_read_at`)
- Query: Fetch all `phase_review_replies` for PM's tasks, filter client-side where `pm_read_at IS NULL`
- Mark-as-read: When `PhaseReviewReplySection` mounts for a PM, update `pm_read_at = now()` on unread replies
- The existing realtime subscription on `phase_reviews` table can be extended to also listen to `phase_review_replies` for instant badge updates

