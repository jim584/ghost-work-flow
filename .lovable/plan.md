

# Replace Post-Approval Buttons with "Request Changes"

## What Changes

Once a phase has been approved (review_status is "approved"), the three action buttons (Approve, Approve with Changes, Disapprove) will be replaced with a single **"Request Changes"** button.

- **Before approval**: Approve | Approve with Changes | Disapprove (unchanged)
- **After approval**: Request Changes (single button, works like "Approve with Changes")

The "Request Changes" button opens the same review dialog used by "Approve with Changes", reusing the existing flow -- comments, file attachments, voice notes, severity, and deadline. The task status reverts to "in_progress" so the developer sees the revision request.

## Why This Approach

- No database or backend changes needed -- "Request Changes" uses the exact same "approved_with_changes" review type
- Keeps the interface clean and unambiguous after approval
- Preserves the full audit trail since all reviews are stored in the phase_reviews table

## Technical Details

**File: `src/components/dashboards/PhaseReviewSection.tsx` (lines 545-556)**

Split the existing button group into two conditional blocks:

1. **If phase is NOT yet approved** (`phase.review_status !== "approved"`): render the current 3 buttons as-is
2. **If phase IS approved** (`phase.review_status === "approved"`): render a single "Request Changes" button styled in amber (like "Approve with Changes"), which opens the review dialog with `reviewType: "approved_with_changes"`

This is a small, self-contained change to one file with no impact on other components or the database.

