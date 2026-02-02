

## Overview

Add an "Accept Order" feature for Project Managers in the PM Dashboard. When a PM accepts an order, the "Reassign" button will be hidden for that task, indicating they have committed to handling it.

## Current Behavior

Currently, when a task has status `pending`, the PM sees a "Reassign" button that allows them to transfer the task to another PM. According to the existing feature memory, PMs can only reassign tasks while the status is `pending` - once the status changes, only admins can reassign.

## Proposed Solution

Add an `accepted_by_pm` boolean column to the tasks table. When a PM clicks "Accept", this field is set to `true`, and the Reassign button is hidden for that task.

## Implementation Details

### 1. Database Schema Change

Add a new column to the `tasks` table:

```sql
ALTER TABLE public.tasks 
ADD COLUMN accepted_by_pm boolean NOT NULL DEFAULT false;
```

This column will track whether the assigned PM has explicitly accepted the order.

### 2. PM Dashboard UI Changes

**File:** `src/components/dashboards/PMDashboard.tsx`

**A. Add Accept Order Mutation:**

```tsx
const acceptOrder = useMutation({
  mutationFn: async (taskId: string) => {
    const { error } = await supabase
      .from("tasks")
      .update({ accepted_by_pm: true })
      .eq("id", taskId);
    if (error) throw error;
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ["pm-tasks"] });
    toast({ title: "Order accepted successfully" });
  },
  onError: (error: any) => {
    toast({
      variant: "destructive",
      title: "Error accepting order",
      description: error.message,
    });
  },
});
```

**B. Update Card Footer Buttons:**

The current logic shows the Reassign button when `task.status === "pending"`. Update this to:
- Show "Accept Order" button when: `task.status === "pending"` AND `task.accepted_by_pm !== true`
- Show "Reassign" button when: `task.status === "pending"` AND `task.accepted_by_pm !== true`
- Hide both buttons when: `task.accepted_by_pm === true`

```tsx
{task.status === "pending" && !task.accepted_by_pm && (
  <>
    <Button
      size="sm"
      className="bg-green-600 hover:bg-green-700 hover-scale"
      onClick={() => acceptOrder.mutate(task.id)}
    >
      <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
      Accept Order
    </Button>
    <Button
      size="sm"
      variant="outline"
      className="hover-scale"
      onClick={() => setReassignDialog({ 
        open: true, 
        taskId: task.id, 
        currentPmId: task.project_manager_id 
      })}
    >
      <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
      Reassign
    </Button>
  </>
)}
{task.status === "pending" && task.accepted_by_pm && (
  <Badge className="bg-green-100 text-green-700 border-green-300">
    <CheckCircle2 className="h-3 w-3 mr-1" />
    Accepted
  </Badge>
)}
```

**C. Add Visual Indicator (Optional):**

Show an "Accepted" badge on the card when the order has been accepted, replacing the buttons area.

### 3. Logic Summary

| Condition | UI Shown |
|-----------|----------|
| `status === "pending"` AND `accepted_by_pm === false` | Accept Order + Reassign buttons |
| `status === "pending"` AND `accepted_by_pm === true` | "Accepted" badge (no Reassign button) |
| `status !== "pending"` | Neither button (existing behavior) |

### 4. Import Updates

Add `Check` or use existing `CheckCircle2` icon for the Accept button (already imported).

## Technical Summary

| Component | Change |
|-----------|--------|
| Database | Add `accepted_by_pm` boolean column to `tasks` table |
| PMDashboard.tsx | Add `acceptOrder` mutation |
| PMDashboard.tsx | Update card footer to show Accept/Reassign buttons conditionally |
| PMDashboard.tsx | Add "Accepted" badge indicator when order is accepted |

## Expected Behavior After Implementation

1. PM sees a new pending order assigned to them
2. PM can either click "Accept Order" or "Reassign"
3. If they click "Accept Order":
   - The order is marked as accepted
   - Both "Accept Order" and "Reassign" buttons are replaced with an "Accepted" badge
   - PM can no longer reassign this task
4. If they click "Reassign":
   - Existing reassignment flow continues as before
5. Admins can still view acceptance status but this doesn't affect their reassignment capabilities

