

## Problem

The Developer Dashboard's `DevPhaseReviewTimeline.tsx` has the same stale-status bug that was fixed in the PM Dashboard. The `getPhaseStatusBadge` function (line 636) reads `phase.review_status` and `phase.change_completed_at` directly from the `project_phases` table. When a PM submits a new round of "Approve with Changes," the top-level `project_phases` row may still have the old `change_completed_at` timestamp from the previous round, causing the badge to incorrectly show "Changes Done" instead of "Revision In Progress."

This is confusing for developers because they see "Changes Done" in the accordion header but have to expand and scroll to the bottom to discover there is actually a new round of changes requested.

## Fix

**File: `src/components/dashboards/DevPhaseReviewTimeline.tsx`**

1. Update `getPhaseStatusBadge` to accept `phaseReviews` as a second parameter.
2. Inside the function, find the latest actionable review (filtering out `pm_note` and `add_revision_notes`, sorting by `round_number` desc then `reviewed_at` desc).
3. Derive `reviewStatus`, `changeCompletedAt`, and `changeSeverity` from the latest review if one exists, otherwise fall back to the phase-level fields.
4. Update all three call sites (lines 688, 761, 811) to pass `phaseReviews` as the second argument.

This mirrors the exact same pattern already applied in `PhaseReviewSection.tsx` and `LatestSubmissionPanel.tsx`.

