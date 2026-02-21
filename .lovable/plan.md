
# Fix "Delivered: Awaiting Review" Badge for Website Orders

## Problem
Order 147 is a website order, but it incorrectly shows the "Delivered: Awaiting Review" badge because a stale record in the design submissions table has `revision_status = 'pending_review'`. Website orders use the phase review system exclusively, so the design submissions status should not influence the badge.

## Solution
In `PMDashboard.tsx`, skip the `design_submissions` check for website orders in both places where the badge category is determined. Website orders should only use `project_phases` to decide if something is awaiting review.

## Technical Details

**File: `src/components/dashboards/PMDashboard.tsx`**

### Change 1: Group-level categorization (~line 1272)
Currently:
```
if (hasPendingReview) categories.push('recently_delivered');
```
Updated to exclude website orders from the design_submissions-based check:
```
if (hasPendingReview && !isWebsiteGroup) categories.push('recently_delivered');
```
(Move `isWebsiteGroup` declaration before this line since it's currently defined after.)

### Change 2: Task-level `getTaskCategory` function (~line 1345)
Currently:
```
if (hasPendingReview) return 'recently_delivered';
```
Updated to skip for website orders:
```
if (hasPendingReview && task?.post_type !== "Website Design") return 'recently_delivered';
```

These two small changes ensure website orders rely solely on the phase review system for their delivery/review badge status, while all other order types (logo, etc.) continue working as before.
