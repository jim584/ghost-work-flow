

## Two bugs identified in the phase review workflow

### Bug 1: Phase badge stuck on "Changes Done" after Round 2 review

**Root cause**: When the PM submits a Round 2 "Approve with Changes" review, the `submitReview` mutation updates `project_phases.review_status` and `change_deadline` but does NOT reset `change_completed_at` to `null`. Since `getReviewBadge()` checks `if (phase.change_completed_at)` first (line 401 in PhaseReviewSection.tsx), it continues showing "Changes Done (minor)" from Round 1 instead of "Changes In Progress" for Round 2.

**Fix** (in `PhaseReviewSection.tsx`, `submitReview` mutation, ~line 316):
- When `reviewStatus` is `approved_with_changes` or `disapproved_with_changes`, add `change_completed_at: null` and `change_completed_by: null` to the `phaseUpdateData` object so the old round's completion is cleared.

### Bug 2: "Awaiting Review" badge doesn't indicate it's a revision resubmission

**Root cause**: In `LatestSubmissionPanel.tsx`, the `getStatusBadge()` function (line 118-130) shows the same "Awaiting Review" badge for both fresh phase submissions and developer revision resubmissions. The PM has no way to know it's a completed revision needing re-review.

**Fix** (in `LatestSubmissionPanel.tsx`, `getStatusBadge` function):
- Check if the actionable phase has `change_completed_at` set (meaning it's a revision resubmission, not a fresh submission).
- If so, display a distinct badge like **"Changes Submitted — Awaiting Re-review"** (e.g., green-tinted or purple) with a `CheckCircle2` icon, instead of the generic "Awaiting Review".
- Also update the header label to say "Revision Submitted" instead of "Latest Submission" in this case.

### Files to edit
1. `src/components/dashboards/PhaseReviewSection.tsx` — reset `change_completed_at` and `change_completed_by` to null when submitting a new round of changes
2. `src/components/dashboards/LatestSubmissionPanel.tsx` — differentiate the status badge between fresh submissions and revision resubmissions

