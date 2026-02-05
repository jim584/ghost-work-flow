
# Show Partial Team Delivery Status on Card Front

## Problem
When a multi-team order has partial deliveries (e.g., Team A delivered, Team B hasn't), the PM needs to see this at a glance on the card front without expanding it.

## Current State
- The `pending_delivery` category shows "Awaiting Team Delivery" badge
- But this doesn't distinguish between "no teams delivered" vs "some teams delivered"
- PMs must expand the card to see which teams have delivered

## Solution
Add a visual indicator on the card front that shows partial delivery status for multi-team orders.

## Implementation

### File: `src/components/dashboards/PMDashboard.tsx`

### 1. Add Helper Function to Count Delivered Teams
Calculate how many teams have delivered vs total teams:

```typescript
const getMultiTeamDeliveryProgress = (group: typeof groupedOrders[0], allSubmissions: any[]) => {
  if (!group.isMultiTeam) return null;
  
  const teamsWithDeliveries = group.allTasks.filter((task: any) =>
    allSubmissions?.some(s => s.task_id === task.id)
  ).length;
  
  const totalTeams = group.allTasks.length;
  
  return {
    delivered: teamsWithDeliveries,
    total: totalTeams,
    hasPartialDelivery: teamsWithDeliveries > 0 && teamsWithDeliveries < totalTeams
  };
};
```

### 2. Update Card Header to Show Partial Delivery Indicator
In the card header section (around line 1097), add a new badge when there are partial deliveries:

```typescript
{group.isMultiTeam && (
  <>
    <Badge variant="outline" className="bg-indigo-500/10 text-indigo-600 border-indigo-200">
      {group.teamNames.length} Teams
    </Badge>
    {(() => {
      const progress = getMultiTeamDeliveryProgress(group, submissions || []);
      if (progress?.hasPartialDelivery) {
        return (
          <Badge className="bg-blue-500 text-white animate-pulse">
            {progress.delivered}/{progress.total} Teams Delivered
          </Badge>
        );
      }
      return null;
    })()}
  </>
)}
```

### 3. Visual Design Options

**Option A: Badge with count**
```text
[Logo] [2 Teams] [1/2 Teams Delivered] [Awaiting Team Delivery]
```

**Option B: More descriptive badge**
```text
[Logo] [2 Teams] [Team A Delivered - Team B Pending]
```

**Recommended: Option A** - Simple "X/Y Teams Delivered" badge that:
- Is compact and scannable
- Uses blue color to indicate partial progress
- Subtle animation (pulse) to draw attention
- Shows alongside the existing "Awaiting Team Delivery" badge for context

### Expected Result

| Scenario | Card Front Display |
|----------|-------------------|
| Multi-team, no deliveries | `[2 Teams] [Awaiting Team Delivery]` |
| Multi-team, 1 of 2 delivered | `[2 Teams] [1/2 Teams Delivered] [Awaiting Team Delivery]` |
| Multi-team, all delivered pending review | `[2 Teams] [Delivered - Awaiting Review]` |
| Single team | `[Team Name]` (no teams badge) |

## Files to Modify
- `src/components/dashboards/PMDashboard.tsx`

## Summary
Add a "X/Y Teams Delivered" badge on multi-team order cards when at least one team has delivered but not all, giving PMs immediate visibility into partial delivery progress without expanding the card.
