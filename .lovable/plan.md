## Add Unread PM Notes Badge to Both Card and Phase Accordion

### Current State

- The **card-level badge** already exists (line 1460-1473 in `DeveloperDashboard.tsx`) showing total unread notes count.
- The **phase accordion** in `DevPhaseReviewTimeline.tsx` (line 828-857) shows phases but has no per-phase unread indicator.
- Notes are only marked as read when `autoMarkRead={true}` (View Details dialog).

### Implementation Steps

**File: `src/components/dashboards/DevPhaseReviewTimeline.tsx**`

1. In `renderPhaseAccordionItem` (line 836-843), add a small pulsing red dot/badge next to phases that have unread PM notes. Filter `phaseReviews` for entries matching the phase's `id` with `review_status === "pm_note"` and `!dev_read_at`, and if count > 0, render a small red dot indicator beside the phase label.

**File: `src/components/dashboards/DeveloperDashboard.tsx**`

2. No changes needed — the card-level badge already works correctly now that `autoMarkRead` defaults to `false` on the card's embedded timeline.

### Summary

- Card shows "X unread notes" badge (existing).
- Phase accordion items show a red dot next to specific phases with unread notes.
- Notes only get marked as read when developer opens View Details dialog or expands the phase accordian for which the notes were added.