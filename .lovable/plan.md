

# Fix: "Changes Needed" Badge Not Showing for Round 2 on Developer Dashboard

## Problem
Order 148 has two review rounds for Phase 1:
- Round 1: `change_completed_at` is set (developer already completed it)
- Round 2: `change_completed_at` is null (pending -- developer needs to act)

The badge does not appear because the `phase_reviews` query sorts by `reviewed_at ASC`, and the `.find()` call picks round 1 first. Since round 1 has `change_completed_at` set, the logic concludes no badge is needed and skips round 2 entirely.

## Root Cause
In `DeveloperDashboard.tsx` line 508, the query orders reviews by `reviewed_at ascending`. The `.find()` at line 1413 then grabs the first matching record (round 1), which already has its changes completed, so the badge is hidden.

## Fix
Change the query sort order from `reviewed_at ascending` to `round_number descending`, matching the PM dashboard query. This ensures `.find()` always picks the latest round first.

## Technical Details

**File: `src/components/dashboards/DeveloperDashboard.tsx`**

**Line 508** -- Change:
```
.order("reviewed_at", { ascending: true });
```
to:
```
.order("round_number", { ascending: false });
```

This single-line fix ensures the latest review round is always checked first, so the "Changes Needed" badge correctly appears for round 2 of order 148.
