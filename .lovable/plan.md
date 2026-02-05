

# Update Status Badge for Partially Delivered Orders

## Problem
When a multi-team order has partial deliveries (e.g., Team A delivered, Team B hasn't), the status badge still shows the raw database status like "pending" instead of reflecting the actual "Partially Delivered" state.

## Current State
- Line 1138-1140 shows: `{task.status.replace("_", " ")}` (e.g., "pending")
- The "X/Y Teams Delivered" badge is shown, but the main status badge doesn't change

## Solution
Update the status badge logic to show "Partially Delivered" for multi-team orders when at least one team has delivered but not all.

## Implementation

### File: `src/components/dashboards/PMDashboard.tsx`

### Update Status Badge Section (around line 1137-1141)

Replace the static status badge with dynamic logic:

```typescript
<div className="flex items-center gap-2 flex-shrink-0">
  {(() => {
    // Check for partial delivery status on multi-team orders
    if (group.isMultiTeam) {
      const progress = getMultiTeamDeliveryProgress(group, submissions || []);
      if (progress?.hasPartialDelivery) {
        return (
          <Badge className="bg-blue-600 text-white shadow-sm">
            Partially Delivered
          </Badge>
        );
      }
    }
    // Default to regular status
    return (
      <Badge className={`${getStatusColor(task.status)} shadow-sm`}>
        {task.status.replace("_", " ")}
      </Badge>
    );
  })()}
  {/* Delete button - only show if still pending and no deliveries */}
  {task.status === "pending" && !getMultiTeamDeliveryProgress(group, submissions || [])?.hasPartialDelivery && (
    <Button
      size="sm"
      variant="ghost"
      className="h-8 w-8 p-0 hover:bg-destructive/10"
      onClick={() => setDeleteTaskId(task.id)}
    >
      <Trash2 className="h-4 w-4 text-destructive" />
    </Button>
  )}
</div>
```

### Expected Result

| Scenario | Status Badge |
|----------|-------------|
| Multi-team, no deliveries | `pending` (yellow) |
| Multi-team, 1 of 2 delivered | `Partially Delivered` (blue) |
| Multi-team, all delivered pending review | `pending` or `in_progress` |
| Single team | Normal status from database |

## Files to Modify
- `src/components/dashboards/PMDashboard.tsx`

## Summary
Change the main status badge to show "Partially Delivered" (in blue) for multi-team orders when at least one team has delivered but not all. This makes the partial delivery state immediately visible without relying on the smaller progress badge.

