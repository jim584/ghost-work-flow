

## Fix: Remove "Round" label and severity badge from PM Notes

### Problem
When expanding a phase accordion, PM notes display:
- **"Round 1: PM Notes"** — Notes are not formal review rounds, so showing "Round 1" is misleading.
- **"minor -- 2h"** severity badge — This severity indicator (hours allocated for changes) is irrelevant for notes since no changes are being requested.

### Solution
Update the review card in `PhaseReviewSection.tsx` to handle PM notes differently from formal reviews.

### Changes

**File: `src/components/dashboards/PhaseReviewSection.tsx`**

1. **Badge label (line 93-94)**: For PM notes, show just "PM Notes" without the "Round X:" prefix. Keep the round number for actual reviews.
   - Before: `Round 1: PM Notes`
   - After: `PM Notes`

2. **Severity badge (lines 96-101)**: Hide the severity/hours badge when the entry is a PM note, since notes don't carry actionable severity.
   - Before: Shows "minor -- 2h" next to PM notes
   - After: No severity badge for PM notes

### Technical Detail

The `isPmNote` flag (line 71) already identifies PM notes via `review.review_status === "pm_note"`. The fix will:
- Line 94: Change from `Round {review.round_number}: {statusLabel}` to a conditional: if `isPmNote`, show just `{statusLabel}`; otherwise keep the current format.
- Lines 96-101: Wrap the severity badge condition with an additional `!isPmNote` check so it only renders for actual reviews.
