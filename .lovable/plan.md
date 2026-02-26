

## Cancel & Re-review + PM Notes Edit/Delete (1-hour window)

### Scenario Walkthrough

**Approved phases**: The existing "Request Changes" button creates a new `approved_with_changes` review. Once that revision request exists, the PM can then use "Cancel & Re-review" on it (same as any other pending revision). No separate "Revoke Approval" action needed.

**Approved with Changes / Disapproved with Changes (pending revision)**: PM sees a "Cancel Revision" button next to the active revision. Clicking it marks that review as superseded and lets the PM submit a fresh review (different notes, severity, or even change from disapproved to approved_with_changes).

**After canceling**: The phase reverts to the state before the canceled review — if it was approved before the revision request, it goes back to approved. The superseded review remains visible in the timeline with a "Superseded" badge (strikethrough/muted styling) for audit purposes.

**PM Notes**: PM can edit or delete their own PM Notes within **1 hour** of creation. After 1 hour, notes become immutable.

### Database Changes

**Add columns to `phase_reviews`:**
- `superseded_at` (timestamptz, nullable) — when this review was canceled
- `superseded_by` (uuid, nullable) — the PM who canceled it

### Code Changes

**File: `src/components/dashboards/PhaseReviewSection.tsx`**

1. Add "Cancel Revision" button visible to the assigned PM when a phase has an active (non-superseded) revision with no `change_completed_at`. Clicking it:
   - Sets `superseded_at = now()` and `superseded_by = userId` on the review
   - Reverts `project_phases` fields (review_status, change_deadline, change_severity, etc.) to the previous review's state or null
   - Re-opens the review dialog so the PM can submit a corrected review immediately
2. Update `getLatestActionableReviewForPhase` to filter out superseded reviews (`superseded_at IS NULL`)
3. Update `hasActiveRevision` check to exclude superseded reviews

**File: `src/components/dashboards/DevPhaseReviewTimeline.tsx`**

4. Update `getPhaseStatusBadge` and review filtering to exclude superseded reviews from status derivation
5. Render superseded reviews in the timeline with a muted "Superseded" badge and reduced opacity

**File: `src/components/dashboards/LatestSubmissionPanel.tsx`**

6. Update `getLatestActionableReview` to filter out superseded reviews

**File: `src/components/dashboards/TeamOverviewDashboard.tsx`**

7. Update phase status derivation to exclude superseded reviews

**PM Notes Edit/Delete (1-hour window):**

**File: `src/components/dashboards/PhaseReviewSection.tsx`**

8. Add edit/delete buttons on `pm_note` review items where `reviewed_by === userId` and `created_at` is within 1 hour
9. Edit: opens a dialog pre-filled with existing comment, updates the `phase_reviews` row
10. Delete: removes the `phase_reviews` row after confirmation

**File: `src/components/dashboards/DevPhaseReviewTimeline.tsx`**

11. Show edit/delete controls on PM Notes in the developer timeline (only if the current user is the author and within 1 hour)

**RLS Policy Updates:**
- Add UPDATE policy for PMs on `phase_reviews` (currently PMs can only INSERT and SELECT) to allow setting `superseded_at`/`superseded_by` and editing PM notes
- Add DELETE policy for PMs on `phase_reviews` restricted to `pm_note` records they authored

