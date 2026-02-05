
# Consolidate Multi-Team Orders into Single Cards

## Problem
When a logo order is assigned to multiple designer teams (e.g., Team A and Team B), the system creates separate tasks for each team. This results in the PM dashboard showing 2 cards for what is essentially 1 order, causing confusion and clutter.

## Solution Overview
Group related tasks into a single order card that displays all assigned teams and their submissions in an organized way.

## Implementation Approach

### Phase 1: Database Changes

Add an `order_group_id` column to the `tasks` table to link related tasks together:

```text
+------------------+      +------------------+      +------------------+
|   Task (Team A)  |      |   Task (Team B)  |      |   Task (Team C)  |
|  order_group_id  |----->|  order_group_id  |----->|  order_group_id  |
|    = "abc123"    |      |    = "abc123"    |      |    = "abc123"    |
+------------------+      +------------------+      +------------------+
         \                        |                        /
          \                       |                       /
           +----------------------+-----------------------+
                                  |
                    +-------------v-------------+
                    |     Single Order Card     |
                    |   showing all 3 teams     |
                    +---------------------------+
```

**SQL Migration:**
- Add `order_group_id` (UUID, nullable) to `tasks` table
- For single-team orders, this will be NULL (displayed as before)
- For multi-team orders, all related tasks share the same group ID

### Phase 2: Order Creation Changes

**File:** `src/components/dashboards/CreateLogoOrderForm.tsx`

When creating a multi-team logo order:
1. Generate a single `order_group_id` UUID
2. Assign this same ID to all tasks being created
3. Single-team orders will have `order_group_id = null`

### Phase 3: PM Dashboard UI Changes

**File:** `src/components/dashboards/PMDashboard.tsx`

**Data Processing:**
1. Group tasks by `order_group_id` (or by `id` if no group)
2. For grouped orders, use first task's details for the card header
3. Aggregate team information and submissions

**Card Layout for Multi-Team Orders:**

```text
+------------------------------------------------------------------+
| #123  Logo  [Pending]                                            |
| Acme Corporation Logo                                            |
+------------------------------------------------------------------+
| Customer          | Payment           | Assignment               |
| John Doe          | $500 total        | 2 teams assigned        |
| john@acme.com     | $250 paid         | Created: Jan 15, 2025   |
+------------------------------------------------------------------+
|  Team Submissions                                                |
|  +------------------------------------------------------------+  |
|  | Design Team A                           [2 files uploaded] |  |
|  | - logo_v1.png    [Pending Review]  [Download] [Approve]    |  |
|  | - logo_v2.png    [Approved]        [Download]              |  |
|  +------------------------------------------------------------+  |
|  | Design Team B                           [1 file uploaded]  |  |
|  | - logo_concept.ai [Needs Revision] [Download]              |  |
|  +------------------------------------------------------------+  |
+------------------------------------------------------------------+
| [View Details]  [Accept Order]                    [Show Files v] |
+------------------------------------------------------------------+
```

**Key UI Features:**
- Single card per order (not per team)
- "Assignment" section shows "X teams assigned" instead of single team
- Expandable section organized by team
- Each team's submissions clearly labeled
- Status badges per team's submissions
- Download/approve/revision actions per file
- Overall order status based on aggregate (e.g., "Pending" if any team pending)

### Phase 4: Update Related Components

**Designer Dashboard:** No changes needed - designers only see their team's task

**Admin Dashboard:** May need similar grouping if it displays raw tasks

**Front Sales Dashboard:** Apply same grouping logic if applicable

## Technical Details

### Database Migration
```sql
-- Add order_group_id to link related tasks
ALTER TABLE public.tasks 
ADD COLUMN order_group_id uuid DEFAULT NULL;

-- Index for efficient grouping queries
CREATE INDEX idx_tasks_order_group_id ON public.tasks(order_group_id);
```

### Grouping Logic (TypeScript)
```typescript
// Group tasks by order_group_id
const groupedOrders = useMemo(() => {
  if (!tasks) return [];
  
  const groups = new Map();
  
  tasks.forEach(task => {
    const key = task.order_group_id || task.id; // Use task.id if no group
    if (!groups.has(key)) {
      groups.set(key, {
        primaryTask: task,
        relatedTasks: [],
        allSubmissions: []
      });
    }
    if (task.order_group_id) {
      groups.get(key).relatedTasks.push(task);
    }
  });
  
  return Array.from(groups.values());
}, [tasks]);
```

### Card Rendering
- Iterate over `groupedOrders` instead of `tasks`
- For multi-team orders, show team tabs/accordion in submissions section
- Each team section shows its task's submissions with team name header

## Files to Modify
1. **New Migration:** Add `order_group_id` column
2. **CreateLogoOrderForm.tsx:** Generate and assign group ID for multi-team orders
3. **PMDashboard.tsx:** Group tasks and render consolidated cards
4. **CreateTaskForm.tsx:** (if applicable) Similar multi-team support

## Benefits
- Cleaner PM dashboard with one card per order
- Clear visibility of which teams are working on the order
- Easy to see which teams have uploaded files
- Reduced visual clutter and confusion
- Better organization of file submissions by team
