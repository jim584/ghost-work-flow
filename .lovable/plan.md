

## Fix: Unread PM Notes Badge Not Appearing Reliably

### Root Causes

1. **Race condition**: When the developer has a task card expanded, the `DevPhaseReviewTimeline` useEffect auto-marks PM notes as read immediately upon refetch. The badge on the card exterior flashes for milliseconds then vanishes -- the developer never sees it.

2. **No polling fallback**: The `developer-phase-reviews` query relies solely on realtime subscription for updates. If the event is missed or delayed, the badge never appears.

### Implementation Steps

**File: `src/components/dashboards/DeveloperDashboard.tsx`**

1. Add a `refetchInterval` of 30 seconds to the `developer-phase-reviews` query as a fallback for missed realtime events. This ensures the badge will appear within 30 seconds even if realtime fails.

2. Add the same `refetchInterval` to the `developer-unread-replies` query for consistency.

**File: `src/components/dashboards/DevPhaseReviewTimeline.tsx`**

3. Delay the auto-mark-as-read behavior: only mark PM notes as read after a 2-second delay when the timeline is visible. This gives the card-level badge time to render and be noticed before the timeline clears the unread state. Use a `setTimeout` inside the `useEffect` with cleanup on unmount.

### No database changes needed.

