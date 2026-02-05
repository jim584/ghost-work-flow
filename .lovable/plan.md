
# Fix Priority View for Multi-Team Orders with Partial Deliveries

## Problem
When a logo order is assigned to multiple teams (e.g., Team A and Team B):
1. Team A delivers files, PM approves them
2. Team B hasn't delivered anything yet
3. The order incorrectly disappears from Priority view because all *existing* submissions are approved
4. It should stay in Priority view until ALL teams have delivered AND all submissions are approved

## Root Cause
In `PMDashboard.tsx`, the `getGroupCategory` function (lines 556-575) only checks if existing submissions are approved, not whether all teams have submitted:

```typescript
// Current problematic logic
const allApproved = groupSubmissions.length > 0 && 
                    groupSubmissions.every(s => s.revision_status === 'approved');
```

## Solution

### 1. Update `getGroupCategory` Function
Add logic to check if all teams in a multi-team order have at least one submission:

```typescript
const getGroupCategory = (group, allSubmissions) => {
  const groupSubmissions = group.allTasks.flatMap((task) => 
    allSubmissions?.filter(s => s.task_id === task.id) || []
  );
  
  // Check submissions per team
  const tasksWithSubmissions = group.allTasks.filter((task) =>
    allSubmissions?.some(s => s.task_id === task.id)
  );
  const allTeamsHaveSubmissions = tasksWithSubmissions.length === group.allTasks.length;
  
  // Existing checks
  const hasPendingReview = groupSubmissions.some(s => s.revision_status === 'pending_review');
  const hasNeedsRevision = groupSubmissions.some(s => s.revision_status === 'needs_revision');
  const allSubmissionsApproved = groupSubmissions.length > 0 && 
                                  groupSubmissions.every(s => s.revision_status === 'approved');
  
  // Only truly complete if ALL teams submitted AND all approved
  const allApproved = allTeamsHaveSubmissions && allSubmissionsApproved;
  
  // NEW: Check for teams that haven't submitted yet
  const hasTeamsPendingDelivery = group.isMultiTeam && !allTeamsHaveSubmissions;
  
  // Priority order:
  if (hasPendingReview) return 'recently_delivered';
  if (hasNeedsRevision) return 'needs_revision';
  if (isDelayed) return 'delayed';
  if (hasTeamsPendingDelivery) return 'pending_delivery'; // NEW category
  if (allApproved) return 'other';
  // ... rest of logic
};
```

### 2. Add "Pending Delivery" Category to Priority View
Update the filter to include the new `pending_delivery` category in Priority view:

```typescript
if (statusFilter === 'priority') {
  const category = getGroupCategory(group, submissions || []);
  return ['recently_delivered', 'delayed', 'pending', 'in_progress', 
          'needs_revision', 'pending_delivery'].includes(category);
}
```

### 3. Update Stats to Track Pending Deliveries

```typescript
const stats = {
  // ... existing stats
  pending_delivery: groupedOrders.filter(g => 
    getGroupCategory(g, submissions || []) === 'pending_delivery'
  ).length,
};
```

### 4. Add Visual Indicator in Card UI
For multi-team orders with partial deliveries, show team-specific status:

```text
+------------------------------------------------------------------+
| Team Submissions                                                 |
|  +------------------------------------------------------------+  |
|  | Design Team A                    [Approved] (2 files)      |  |
|  +------------------------------------------------------------+  |
|  | Design Team B                    [Pending Delivery]        |  |
|  |   Awaiting file upload from designer                       |  |
|  +------------------------------------------------------------+  |
+------------------------------------------------------------------+
```

### 5. Add Helper Function for Team Status
Create a function to determine each team's delivery status:

```typescript
const getTeamDeliveryStatus = (task, allSubmissions) => {
  const teamSubmissions = allSubmissions?.filter(s => s.task_id === task.id) || [];
  
  if (teamSubmissions.length === 0) {
    return { status: 'pending_delivery', label: 'Pending Delivery', color: 'warning' };
  }
  
  const hasPending = teamSubmissions.some(s => s.revision_status === 'pending_review');
  const hasRevision = teamSubmissions.some(s => s.revision_status === 'needs_revision');
  const allApproved = teamSubmissions.every(s => s.revision_status === 'approved');
  
  if (hasPending) return { status: 'pending_review', label: 'Pending Review', color: 'blue' };
  if (hasRevision) return { status: 'needs_revision', label: 'Needs Revision', color: 'destructive' };
  if (allApproved) return { status: 'approved', label: 'Approved', color: 'success' };
  return { status: 'in_progress', label: 'In Progress', color: 'default' };
};
```

## Files to Modify
- `src/components/dashboards/PMDashboard.tsx`

## Expected Behavior After Fix

| Scenario | Priority View | Card Display |
|----------|--------------|--------------|
| Multi-team, Team A approved, Team B no upload | Stays in Priority | Team A: Approved, Team B: Pending Delivery |
| Multi-team, Team A approved, Team B pending review | Stays in Priority | Team A: Approved, Team B: Pending Review |
| Multi-team, both teams approved | Moves to "All Tasks" | Team A: Approved, Team B: Approved |
| Single-team, approved | Moves to "All Tasks" | Files approved |

## Summary
The order will only leave Priority view when:
1. ALL teams have submitted files
2. ALL submissions are approved

Until then, the card will clearly show which teams have delivered and which are still pending.
