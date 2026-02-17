

# Add Phase Submission Check to Website Order Cancel Button

## What Changes

The cancel button already exists for PMs on order cards. The change is to **hide it for website orders once any phase has been submitted**. For non-website orders (social media, logo), the existing behavior stays the same.

## Technical Details

### File: `src/components/dashboards/PMDashboard.tsx`

There are **3 locations** where the cancel button/icon appears that need updating:

1. **Line ~1500** -- Cancel icon button on the card header (single-team orders)
2. **Line ~1647** -- Cancel icon in multi-team status list
3. **Line ~1803** -- "Cancel Order" text button in expanded card view

For each location, add a check: if it's a website order, verify that no phase for this task has a `completed_at` timestamp (meaning no phase has been submitted yet).

The helper logic:
```typescript
const hasAnySubmittedPhase = isWebsite 
  ? (projectPhases || []).some((p: any) => p.task_id === task.id && p.completed_at)
  : false;
```

Then update each cancel condition to include `&& !hasAnySubmittedPhase`.

This means:
- Website orders: Cancel available only when pending/in_progress AND no phase submitted
- Non-website orders: Cancel available when pending/in_progress (unchanged behavior)

No database changes needed -- all data is already available via the existing `projectPhases` query.

