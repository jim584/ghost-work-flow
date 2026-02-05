

# Update Delayed Logic for Revision Requests in Designer Dashboard

## Problem
Currently, the delayed task logic in the Designer Dashboard:
1. Uses task `created_at` timestamp for calculating delay hours
2. Uses a fixed 24-hour threshold for both pending tasks and revision requests
3. Shows hours since task creation on the delayed badge

## Requested Behavior
1. When a revision is requested, the order should go into "delayed" after **12 hours** (not 24 hours)
2. The delayed hours shown should be based on **when the revision was requested** (`reviewed_at` timestamp), not task creation time

## Current Implementation (lines 250-256)

```typescript
const isTaskDelayed = (task: any) => {
  const createdAt = new Date(task.created_at);
  const hoursSinceCreation = differenceInHours(new Date(), createdAt);
  const needsRevision = tasksNeedingRevision.some(t => t.id === task.id);
  return hoursSinceCreation > 24 && (task.status === "pending" || needsRevision);
};
```

## Solution

### File: `src/components/dashboards/DesignerDashboard.tsx`

### 1. Update `isTaskDelayed` Function

Change the logic to handle two scenarios differently:
- **Pending tasks**: Use 24-hour threshold from `created_at`
- **Revision requests**: Use 12-hour threshold from `reviewed_at` (the timestamp when PM requested the revision)

```typescript
const isTaskDelayed = (task: any) => {
  const taskSubmissions = submissions?.filter(s => s.task_id === task.id) || [];
  const revisionSubmission = taskSubmissions.find(s => s.revision_status === "needs_revision");
  
  if (revisionSubmission && revisionSubmission.reviewed_at) {
    // Revision request: 12-hour threshold from when revision was requested
    const hoursSinceRevision = differenceInHours(new Date(), new Date(revisionSubmission.reviewed_at));
    return hoursSinceRevision > 12;
  }
  
  // Pending task: 24-hour threshold from creation
  if (task.status === "pending") {
    const hoursSinceCreation = differenceInHours(new Date(), new Date(task.created_at));
    return hoursSinceCreation > 24;
  }
  
  return false;
};
```

### 2. Create Helper Function for Delayed Hours Display

Add a new function to get the correct delay hours based on whether it's a revision or pending task:

```typescript
const getDelayedHours = (task: any) => {
  const taskSubmissions = submissions?.filter(s => s.task_id === task.id) || [];
  const revisionSubmission = taskSubmissions.find(s => s.revision_status === "needs_revision");
  
  if (revisionSubmission && revisionSubmission.reviewed_at) {
    // Show hours since revision was requested
    return differenceInHours(new Date(), new Date(revisionSubmission.reviewed_at));
  }
  
  // Show hours since task creation
  return differenceInHours(new Date(), new Date(task.created_at));
};
```

### 3. Update Delayed Badge Display (around line 518-523)

Replace the current delayed badge to use the new helper function:

```typescript
{isDelayed && (
  <Badge variant="destructive" className="gap-1 animate-pulse">
    <AlertTriangle className="h-3 w-3" />
    DELAYED {getDelayedHours(task)}h
  </Badge>
)}
```

### 4. Update Warning Banner Text (around line 359-361)

Update the warning message to reflect the new behavior:

```typescript
<p className="text-sm text-muted-foreground">
  {stats.delayed} task{stats.delayed > 1 ? 's have' : ' has'} exceeded their time limit. 
  Please prioritize {stats.delayed > 1 ? 'these orders' : 'this order'} urgently.
</p>
```

## Expected Behavior

| Scenario | Threshold | Delay Calculation |
|----------|-----------|-------------------|
| Pending task | 24 hours | From `task.created_at` |
| Revision requested | 12 hours | From `submission.reviewed_at` |

| Example | Status | Shows |
|---------|--------|-------|
| Task created 30h ago, pending | DELAYED 30h | Hours since creation |
| Revision requested 15h ago | DELAYED 15h | Hours since revision request |
| Revision requested 8h ago | Not delayed | (under 12h threshold) |

## Files to Modify
- `src/components/dashboards/DesignerDashboard.tsx`

## Summary
- Pending tasks remain on a 24-hour delay threshold from creation
- Revision requests use a shorter 12-hour delay threshold from when the PM requested the revision
- The delayed badge shows the appropriate hours based on the delay type (creation time vs revision request time)

