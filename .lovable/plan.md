

# Fix: Hide Review Buttons for Unsubmitted Phases

## Problem
Phase 7 shows "Approve", "Approve with Changes", and "Disapprove" buttons even though the developer hasn't submitted any work for it yet. The current condition only checks `phase.status === "in_progress"`, which is true as soon as the phase is created.

## Root Cause
Line 444 in `PhaseReviewSection.tsx`:
```
const canReview = isAssignedPM && !readOnly && (phase.status === "in_progress" || phase.status === "completed");
```
This doesn't verify that the phase has any submission (URL/files) to actually review.

## Solution
Add a check that the phase has been submitted before showing review buttons. A phase is considered submitted when it has a `completed_at` timestamp (meaning the developer clicked "Submit Phase X") OR has submissions in the submissions array for that phase number.

## Technical Details

### File: `src/components/dashboards/PhaseReviewSection.tsx`

Update the `canReview` condition on line 444 to:

```
const hasBeenSubmitted = phase.completed_at || phaseUrls.length > 0;
const canReview = isAssignedPM && !readOnly && hasBeenSubmitted && (phase.status === "in_progress" || phase.status === "completed");
```

This ensures:
- A phase must have been submitted (has `completed_at` or has submission URLs) before review buttons appear
- Phase 7, which is `in_progress` but never submitted, will NOT show review buttons
- Phase 6, which was submitted and then reviewed, continues to work correctly
- No other files need changes

