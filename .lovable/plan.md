
# Plan: Display Order Creator Information

## Overview
Add a "Created By" field to the task/order details view so Admins and Project Managers can see who originally created an order, separate from the "Transferred By" and "Closed By" attribution fields.

## Changes Required

### 1. Update Task Queries to Include Creator Profile
Modify the task fetch queries in both Admin and PM dashboards to join the `created_by` field with the profiles table to get the creator's name.

**Files affected:**
- `src/components/dashboards/AdminDashboard.tsx`
- `src/components/dashboards/PMDashboard.tsx`

### 2. Display "Created By" in Task Details
Add a new field in the task details dialog/view showing who created the order:
- Label: "Created By"
- Value: Creator's full name (or email as fallback)
- Position: Near other attribution fields (Transferred By, Closed By)

### 3. Update Front Sales Dashboard (Optional)
The Front Sales dashboard could also show this field in their order details view for consistency.

**File affected:**
- `src/components/dashboards/FrontSalesDashboard.tsx`

---

## Technical Details

### Query Update Example
```typescript
const { data: tasks } = useQuery({
  queryFn: async () => {
    const { data } = await supabase
      .from("tasks")
      .select(`
        *,
        teams(name),
        profiles!tasks_project_manager_id_fkey(email, full_name),
        creator:profiles!tasks_created_by_fkey(email, full_name),
        transferred_by_profile:profiles!tasks_transferred_by_fkey(email, full_name),
        closed_by_profile:profiles!tasks_closed_by_fkey(email, full_name)
      `);
    return data;
  }
});
```

### UI Display
In the task details section, add:
```
Created By: [Creator Name]
Transferred By: [Name or "—"]
Closed By: [Name]
```

---

## Summary
This change ensures complete visibility into order attribution by showing:
1. **Created By** - Who originally submitted the order
2. **Transferred By** - Who handed off the lead (optional)
3. **Closed By** - Who finalized the sale

All three fields will be visible to Admins and PMs in task details.
