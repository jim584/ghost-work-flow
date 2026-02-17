

# Add PM Notes and Put on Hold for Unsubmitted Phases

## Problem
When a phase is in progress but hasn't been submitted yet by the developer, the PM currently sees nothing actionable. The PM should be able to:
1. **Add Notes/Comments** -- to guide the developer while they work on the phase
2. **Put on Hold** -- to pause the phase when the customer is unavailable, traveling, or hasn't provided required information

## Solution Overview
Add two new buttons in the phase accordion for unsubmitted in-progress phases (replacing where the review buttons used to be):
- "Add Notes" -- opens a dialog where the PM can type comments (with optional voice/files) that get stored as a phase review record with a special `pm_note` type
- "Put on Hold" -- opens a dialog requiring a reason, then sets the phase status to `on_hold` and shows a visual indicator

## Technical Details

### 1. Database Migration
Add two new columns to the `project_phases` table:
- `hold_reason` (text, nullable) -- stores why the phase was put on hold
- `held_at` (timestamptz, nullable) -- when it was put on hold
- `held_by` (uuid, nullable) -- who put it on hold

No enum changes needed since `project_phases.status` is a text column, so `on_hold` works directly.

### 2. File: `src/components/dashboards/PhaseReviewSection.tsx`

**A. New condition for PM actions on unsubmitted phases (around line 446):**
```typescript
const canAddPreSubmitNotes = isAssignedPM && !readOnly && !hasBeenSubmitted && phase.status === "in_progress";
const canPutOnHold = isAssignedPM && !readOnly && phase.status === "in_progress" && !hasBeenSubmitted;
const canResumeFromHold = isAssignedPM && !readOnly && phase.status === "on_hold";
```

**B. New UI buttons inside `renderPhaseItem` (after the canReview buttons block):**
- When `canAddPreSubmitNotes` is true: show "Add Notes" button (uses the existing review dialog with a new `pm_note` type)
- When `canPutOnHold` is true: show "Put on Hold" button opening a small dialog for the hold reason
- When `canResumeFromHold` is true: show "Resume" button to set status back to `in_progress`

**C. Update the review dialog** to handle the new `pm_note` type:
- Add `pm_note` to the reviewType union
- In the dialog title, show "Add Notes -- Phase X"
- Skip severity selection for pm_note (like add_revision_notes)
- Insert into `phase_reviews` with `review_status: "pm_note"` so it appears in the timeline

**D. Add hold/resume mutation:**
- Put on Hold: updates `project_phases` to set `status = 'on_hold'`, `hold_reason`, `held_at`, `held_by`
- Resume: updates `project_phases` to set `status = 'in_progress'`, clears hold fields

**E. Update accordion badge (`getReviewBadge`):**
- When `phase.status === "on_hold"`, show a blue/gray "On Hold" badge with the hold reason

### 3. Visual Layout for Unsubmitted Phase
When phase is in_progress and not yet submitted:
```
[Add Notes]  [Put on Hold]
```

When phase is on_hold:
```
Badge: "On Hold" (blue/gray)
[Resume]
Hold reason displayed below
```

### 4. Developer Dashboard Visibility
PM notes stored as `phase_reviews` with `review_status: "pm_note"` will automatically appear in the developer's phase timeline via the existing `ReviewHistoryItem` component, since it already renders all reviews for the phase. The "On Hold" status will also be visible to developers through the phase status badge.

