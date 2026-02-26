

## Plan: Add "Latest Submission" Panel to PM Order Cards

### Problem
For website orders, the most recent developer submission is buried inside the phase accordion (often under "Other Phases"), requiring multiple clicks to find and review.

### Solution
Add a prominent "Latest Submission" summary section directly on the order card body, above the existing PhaseReviewSection. This section will:

1. **Show the most recently submitted phase** with its URLs, comment, submission timestamp, and attached files
2. **Include inline review action buttons** (Approve / Approve w/ Changes / Disapprove) so the PM can act immediately without expanding anything
3. **Show the latest review reply activity** if there are unread replies on that phase
4. **Only appear when there's actionable content** (a submitted phase awaiting review, or a phase with pending changes)

### Implementation Steps

**Step 1: Add a `LatestSubmissionPanel` component section inside `PMDashboard.tsx`**
- Located in the card body, right after the info grid and before the existing `PhaseReviewSection`
- Only renders for website orders with at least one submitted phase
- Finds the most recent phase that has `completed_at` set and hasn't been fully approved yet (or has pending changes)
- Displays: phase label, submission timestamp, submitted URLs (parsed from `submission_comment`), and review action buttons

**Step 2: Modify the order card rendering (lines ~2376-2391 in PMDashboard.tsx)**
- Insert the new panel between the info grid section and the existing `PhaseReviewSection`
- The panel will have a distinct visual style (highlighted border, icon) to draw attention
- Will include the same review buttons that currently exist inside `PhaseReviewSection` (Approve, Approve w/ Changes, Disapprove)
- Clicking a review button will open the same review dialog already wired up in `PhaseReviewSection`

**Step 3: Approach — Inline in PMDashboard vs. separate component**
- Build as a self-contained rendered block inside the `filteredOrders.map()` loop in PMDashboard since it needs access to `projectPhases`, `phaseReviews`, `submissions`, and the existing review dialog state
- Uses the same data already fetched (no new queries needed)
- Will compute: latest submitted-but-unreviewed phase, its URLs, and whether action buttons should show

### Visual Design
```text
┌─────────────────────────────────────────────┐
│ 📋 Latest Submission — Phase 2              │
│ Submitted on Feb 25, 2026 at 4:30 PM        │
│                                             │
│ 🔗 Homepage: https://example.com            │
│ 🔗 About: https://example.com/about         │
│                                             │
│ [✓ Approve] [Approve w/ Changes] [Disapprove]│
└─────────────────────────────────────────────┘
```

### Data Flow
- Uses existing `projectPhases` query (already fetched for all website tasks)
- Uses existing `phaseReviews` query (fetched inside `PhaseReviewSection` — will need to lift this query to PMDashboard level or use the `pm-phase-reviews` query)
- Existing `submissions` data for URL parsing
- Review actions will delegate to `PhaseReviewSection`'s review dialog by passing a callback or by duplicating the lightweight review trigger

### Files to Edit
1. **`src/components/dashboards/PMDashboard.tsx`** — Add the latest submission panel block in the card body, fetch `phaseReviews` at dashboard level (or reuse existing query), render the panel with action buttons
2. **`src/components/dashboards/PhaseReviewSection.tsx`** — Optionally expose a helper or accept a prop to highlight/scroll to a specific phase when the PM clicks "View Full Details" from the summary panel

