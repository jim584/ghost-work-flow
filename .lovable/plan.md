
# Fix Priority View for Multi-Team Orders with Partial Deliveries

## Status: ✅ COMPLETED

## Problem
When a logo order is assigned to multiple teams (e.g., Team A and Team B):
1. Team A delivers files, PM approves them
2. Team B hasn't delivered anything yet
3. The order incorrectly disappears from Priority view because all *existing* submissions are approved
4. It should stay in Priority view until ALL teams have delivered AND all submissions are approved

## Solution Implemented

### 1. Added `getTeamDeliveryStatus` Helper Function
Returns per-team status: `pending_delivery`, `pending_review`, `needs_revision`, `approved`, or `in_progress`.

### 2. Updated `getGroupCategory` Function
Now checks if ALL teams in a multi-team order have at least one submission before considering the order complete:
- `allTeamsHaveSubmissions`: Verifies every task in the group has submissions
- `hasTeamsPendingDelivery`: True if it's a multi-team order and not all teams have delivered
- Only returns `'other'` (complete) when all teams submitted AND all submissions are approved

### 3. Added `pending_delivery` Category
- Added to priority view filter
- Added to stats tracking
- Added priority sorting (after delayed, before pending)
- Added yellow border styling
- Added "Awaiting Team Delivery" badge

### 4. Enhanced Multi-Team Accordion UI
Each team now shows its specific delivery status:
- **Pending Delivery** (yellow): No files submitted yet
- **Pending Review** (blue): Files awaiting PM review
- **Needs Revision** (red): Revision requested
- **Approved** (green): All files approved

## Expected Behavior

| Scenario | Priority View | Card Display |
|----------|--------------|--------------|
| Multi-team, Team A approved, Team B no upload | ✅ Stays in Priority | Team A: Approved, Team B: Pending Delivery |
| Multi-team, Team A approved, Team B pending review | ✅ Stays in Priority | Team A: Approved, Team B: Pending Review |
| Multi-team, both teams approved | ✅ Moves to "All Tasks" | Team A: Approved, Team B: Approved |
| Single-team, approved | ✅ Moves to "All Tasks" | Files approved |

## Files Modified
- `src/components/dashboards/PMDashboard.tsx`
