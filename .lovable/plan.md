
# Auto-Accept Self-Assigned Orders by PM

## Overview
When a Project Manager creates an order and assigns themselves as the PM, the "Accept Order" button should not be shown since they've already committed to the order by self-selecting.

## Current Behavior
The Accept Order button appears for all pending tasks where `accepted_by_pm` is false, regardless of who created the order.

## Proposed Behavior
The Accept Order button should NOT appear when:
- The task is pending AND
- The PM hasn't accepted it yet AND
- **The current PM created the task themselves** (`task.created_by === user.id`)

Instead, for self-assigned orders, show the "Accepted" badge immediately (auto-accepted).

## Implementation

### File: `src/components/dashboards/PMDashboard.tsx`

Update the conditional logic around line 1167 from:

```tsx
{task.status === "pending" && !(task as any).accepted_by_pm && (
  <>
    <Button ... >Accept Order</Button>
    <Button ... >Reassign</Button>
  </>
)}
{task.status === "pending" && (task as any).accepted_by_pm && (
  <Badge ...>Accepted</Badge>
)}
```

To:

```tsx
{task.status === "pending" && !(task as any).accepted_by_pm && task.created_by !== user?.id && (
  <>
    <Button ... >Accept Order</Button>
    <Button ... >Reassign</Button>
  </>
)}
{task.status === "pending" && ((task as any).accepted_by_pm || task.created_by === user?.id) && (
  <Badge ...>Accepted</Badge>
)}
```

## Logic Summary

| Scenario | Accept Button | Accepted Badge | Reassign Button |
|----------|--------------|----------------|-----------------|
| PM created & self-assigned | Hidden | Shown | Hidden |
| Front Sales assigned to PM | Shown | Hidden | Shown |
| PM clicked Accept | Hidden | Shown | Hidden |

## Why This Works
- `task.created_by` stores the user ID of whoever created the task
- When a PM creates an order and selects themselves, `created_by` equals their user ID
- By checking `task.created_by !== user?.id`, we exclude self-created orders from showing the Accept button
- The Accepted badge shows for both explicitly accepted orders AND self-assigned orders
