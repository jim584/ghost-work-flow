

# Make "Delivered" Badge Phase-Aware for Website Orders

## Problem

When a developer submits a website phase (e.g., Phase 2 of 5), the PM dashboard shows a generic "Delivered - Awaiting Review" badge. This implies the entire order is complete, when in reality only one phase was delivered.

## Solution

For website orders, replace the generic badge with a phase-specific one like **"Phase 2 Delivered"** so the PM immediately knows which phase needs their review.

## Technical Details

### File: `src/components/dashboards/PMDashboard.tsx`

**1. Update `getCategoryBadge()` (~line 1410)**

Currently:
```typescript
if (category === 'recently_delivered') {
  return <Badge className="bg-green-500 text-white">Delivered - Awaiting Review</Badge>;
}
```

Change to check if it's a website order and, if so, find the latest submitted phase awaiting review:
```typescript
if (category === 'recently_delivered') {
  if (isWebsite) {
    const taskPhases = (projectPhases || [])
      .filter((p: any) => p.task_id === task.id && p.completed_at && !p.reviewed_at)
      .sort((a: any, b: any) => b.phase_number - a.phase_number);
    const latestPhase = taskPhases[0];
    if (latestPhase) {
      return <Badge className="bg-green-500 text-white">
        Phase {latestPhase.phase_number} Delivered
      </Badge>;
    }
  }
  return <Badge className="bg-green-500 text-white">Delivered - Awaiting Review</Badge>;
}
```

This uses the existing `projectPhases` data (already fetched) to find phases that have been submitted (`completed_at` set) but not yet reviewed (`reviewed_at` is null). The highest phase number is shown.

**2. Update `getGroupCategories()` for website orders (~line 845)**

Currently, website orders categorized as "recently_delivered" rely on `design_submissions` data. For website orders with no design submissions, the fallback `hasCompletedTask && groupSubmissions.length === 0` catches them when the task status is `completed`. But if the task is still `in_progress` (because only one phase was delivered, not the whole order), the categorization might miss it.

Add a website-specific check: if any phase for this task has `completed_at` but no `reviewed_at`, categorize it as `recently_delivered`:
```typescript
// For website orders, check phases for pending reviews
const isWebsite = isWebsiteOrder(representativeTask);
if (isWebsite) {
  const hasPhaseAwaitingReview = (projectPhases || []).some(
    (p: any) => activeTasks.some((t: any) => t.id === p.task_id) 
      && p.completed_at && !p.reviewed_at
  );
  if (hasPhaseAwaitingReview) categories.push('recently_delivered');
}
```

**3. Similarly update `getTaskCategory()` (~line 921)**

Add the same phase-aware check for individual task categorization used in single-team orders.

### No database changes needed

All required data (`projectPhases` with `completed_at`, `reviewed_at`, `phase_number`) is already fetched and available in the component.

### Result

- **Website orders**: Badge says "Phase 2 Delivered" (specific phase number)
- **Non-website orders** (social media, logo): Badge stays "Delivered - Awaiting Review" (unchanged)

