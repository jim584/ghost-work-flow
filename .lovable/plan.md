

## Fix: Distinguish "Notes" from "Reviews" in PM Dashboard Phase Accordion

### Problem
When a PM adds notes to a phase (using "Add Notes"), the accordion header shows "1 review" and the expanded section shows "Review History" — even though no formal review was performed. This is confusing because notes and reviews serve different purposes.

### Solution
Update the labels to be context-aware by separating the count of actual reviews vs. PM notes, and adjusting the display text accordingly.

### Changes

**File: `src/components/dashboards/PhaseReviewSection.tsx`**

1. **Accordion header count (lines 520-523)**: Instead of showing a flat "X review(s)" count, split into reviews and notes:
   - If there are only PM notes: show "1 note" / "2 notes"
   - If there are only reviews: show "1 review" / "2 reviews"  
   - If there are both: show "1 review, 2 notes" (combined)

2. **Section header (line 591)**: Change "Review History" to "Activity History" — a neutral label that covers both reviews and notes accurately.

### Technical Detail

The `reviewsForPhase` array contains all `phase_reviews` records for a phase, including those with `review_status === "pm_note"`. The fix will:
- Count notes: `reviewsForPhase.filter(r => r.review_status === "pm_note").length`
- Count reviews: `reviewsForPhase.filter(r => r.review_status !== "pm_note").length`
- Display an appropriate combined label on the accordion trigger
- Rename the expanded section heading from "Review History" to "Activity History"

