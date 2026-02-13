

# Priority Dashboard for Development Team Leader

## Overview
Add a toggle/tab system to the Development Team Leader's dashboard that separates two distinct views:
- **Team Overview** (default): A priority-sorted dashboard showing all team members' orders with status indicators, overdue alerts, and workload summaries
- **My Orders**: A focused view showing only the team leader's personally assigned tasks

## What Changes

### 1. Dashboard Header Toggle
Add a segmented tab control at the top of the DeveloperDashboard (visible only for team leaders) with two options:
- "Team Overview" -- shows aggregated team status
- "My Orders" -- shows only tasks where the team leader is the assigned developer

### 2. Team Overview Tab
A new priority-sorted view containing:

**Summary Cards Row**
- Total active orders across all developers
- Orders with overdue SLA deadlines (red highlight)
- Unacknowledged orders past deadline
- Orders in revision status

**Developer Workload Table**
Each row shows a developer with:
- Name
- Active task count
- Current phase progress (e.g., "Phase 2/4")
- SLA status indicator (on time / overdue)
- Late acknowledgement flag

**Priority-Sorted Order List**
All orders sorted by urgency:
1. Overdue SLA deadlines (most overdue first)
2. Late acknowledgements
3. In-progress orders approaching deadline
4. Pending/new orders

Each card shows the assigned developer name prominently alongside existing order information.

### 3. My Orders Tab
Filters the existing task list to only show orders where `developer_id` matches the team leader's developer record, providing a clean personal workspace.

## Technical Details

### File Changes

**`src/components/dashboards/DeveloperDashboard.tsx`**
- Add a `viewMode` state: `"team"` | `"my_orders"` (default `"team"` for team leaders)
- Render tab toggle in the header area (only when `isTeamLeader` is true)
- In "team" view: query all developers with their active task counts and SLA statuses
- In "my orders" view: filter existing `tasks` array to only those assigned to the team leader's developer ID
- Add summary cards component for the team overview
- Sort orders by priority (overdue first, then approaching deadline, then new)

**New query for team overview**
- Fetch all developers with profiles to get names
- Cross-reference with active tasks and their phases/SLA deadlines
- Compute overdue status using existing `calculateOverdueWorkingMinutes` utility

### Data Access
- No new tables or RLS policies needed -- the team leader already has SELECT access to all tasks, phases, developers, and profiles
- Leverages existing queries with additional client-side grouping and sorting

### Priority Sorting Logic
```text
Priority 1: SLA deadline passed (sorted by most overdue)
Priority 2: Late acknowledgement flag = true
Priority 3: In-progress, deadline within 2 hours
Priority 4: Pending (not yet acknowledged)
Priority 5: All other active orders
```

