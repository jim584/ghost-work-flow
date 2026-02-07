
# Monthly Performance Section for Designer Dashboard

## Overview
Add a collapsible "Monthly Performance" section to the Designer Dashboard that shows:
1. A summary card with the total completed orders for the current month
2. A list of current month's completed orders
3. A collapsible section showing previous month's completed orders

The section automatically reflects the correct month boundaries (1st to last day).

## What will be added

### Monthly Performance Section (placed between the stat cards and the task list)
- **Current Month Summary Card**: Displays the current month name/year and the count of completed orders (status = "completed" or "approved") created or completed within the current month
- **Current Month Orders Table**: A list showing task number, title, business name, completion date, and status for each completed order this month
- **Previous Month Section**: A collapsible area showing the same information for the prior month, so designers can compare their progress

### How it updates automatically
- The section uses `date-fns` to calculate `startOfMonth` and `endOfMonth` boundaries dynamically -- no manual reset needed. On the 1st of each month, the "current month" section naturally starts fresh and the old month rolls into "previous month."

## Technical Details

### File Changes
**`src/components/dashboards/DesignerDashboard.tsx`**:
1. Import `startOfMonth`, `endOfMonth`, `subMonths`, `isWithinInterval` from `date-fns` (already partially imported).
2. Add computed variables that filter the existing `tasks` data:
   - `currentMonthCompleted`: tasks with status "completed" or "approved" where `updated_at` falls within the current month
   - `previousMonthCompleted`: same filter but for the previous month
3. Add a new section in the JSX (between the stats grid and the task list card) containing:
   - A summary card showing current month name and completed count
   - A table listing current month completed orders (task #, title, business name, date)
   - A collapsible "Previous Month" section with the same table layout
4. Import `ChevronRight` icon and use `Collapsible` component for the previous month toggle.
5. Add `Calendar` icon from lucide-react for the section header.

No database changes or new queries are needed -- all data comes from the existing `tasks` query which already fetches all tasks for the designer's teams.
