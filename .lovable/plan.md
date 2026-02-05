
# Add Assigned Project Manager to View Details

## Summary
Add an "Assigned Project Manager" field to the View Details dialog in the PM Dashboard so users can always see who is responsible for an order, regardless of whether they are viewing the order as the closer, transferrer, or the PM themselves.

## Current State
- The View Details dialog shows "Transferred By", "Closed By", and "Created By" in the Order Attribution section
- The `project_manager_id` exists on the task but no profile lookup is done for it
- Users who are the closer (but not the PM) cannot see who the assigned PM is

## Implementation

### 1. Update Task Queries to Fetch PM Profile

**File: `src/components/dashboards/PMDashboard.tsx`**

Modify the `myTasks` query to:
- Add `project_manager_id` to the set of user IDs being fetched for profile lookup
- Map the PM profile to a new `project_manager_profile` field on each task

Similarly update the `allTasks` query (used for search) to include the same mapping.

### 2. Update View Details Dialog

Add a new field in the "Order Attribution" section to display the Assigned Project Manager:

```text
Order Attribution Section:
┌───────────────────────────────────────────────────┐
│  Assigned PM      │  Transferred By   │ Closed By│
│  Nick             │  Jordan           │ Jordan   │
└───────────────────────────────────────────────────┘
  Created by: [small muted text]
```

The "Assigned PM" field will show `project_manager_profile.full_name` or fallback to email.

---

## Technical Details

### Query Changes (myTasks)

```typescript
// Add project_manager_id to the userIds set
data.forEach(task => {
  if (task.created_by) userIds.add(task.created_by);
  if (task.transferred_by) userIds.add(task.transferred_by);
  if (task.closed_by) userIds.add(task.closed_by);
  if (task.project_manager_id) userIds.add(task.project_manager_id);  // NEW
});

// Map the project manager profile
return data.map(task => ({
  ...task,
  creator: task.created_by ? profileMap.get(task.created_by) : null,
  transferred_by_profile: task.transferred_by ? profileMap.get(task.transferred_by) : null,
  closed_by_profile: task.closed_by ? profileMap.get(task.closed_by) : null,
  project_manager_profile: task.project_manager_id ? profileMap.get(task.project_manager_id) : null,  // NEW
}));
```

### UI Changes (View Details Dialog)

Update the Order Attribution section to include a 3-column grid with:
1. **Assigned PM** - Shows the project manager's name
2. **Transferred By** - Existing field
3. **Closed By** - Existing field

## Files to Modify
- `src/components/dashboards/PMDashboard.tsx`
  - Lines ~184-186: Add `project_manager_id` to userIds set in `myTasks` query
  - Lines ~200-202: Add `project_manager_profile` mapping in `myTasks` query
  - Lines ~224-226: Add `project_manager_id` to userIds set in `allTasks` query
  - Lines ~240-242: Add `project_manager_profile` mapping in `allTasks` query
  - Lines ~1742-1758: Update Order Attribution section in View Details dialog
