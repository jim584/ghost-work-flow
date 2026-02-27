

## Problem

Order 151 has **all 6 phases approved** but its task status is still `completed` (not `approved`). This happened because all phases were approved **before** the auto-promotion code was added. The auto-promotion logic only runs at the moment a phase is approved going forward — it doesn't retroactively fix existing orders.

Because the status is `completed` (not `approved`):
- The badge logic at line 2266 checks `task.status === 'approved'` → fails → no "Website Completed" badge
- The categorization at line 1576 checks `task.status === 'approved'` → fails → not categorized as `awaiting_launch`
- Instead it falls through to line 2250 which checks `task.status === 'completed'` → shows "Website Completed - Awaiting Final Review"

## Fix

**Two changes needed:**

### 1. Data fix: Update Order 151's status to `approved`
Use the insert tool to run:
```sql
UPDATE tasks SET status = 'approved' WHERE id = '431c4554-336f-409c-838a-34bdf2397359';
```

### 2. Code fix: Also handle `completed` status with all phases approved
In `PMDashboard.tsx`, update the categorization and badge logic to also check for tasks with `status === 'completed'` where all phases have `review_status === 'approved'`. This handles any other orders that were approved before the auto-promotion code existed.

**In `getPriorityCategory` (~line 1576):** Before the existing `awaiting_launch` check, add a fallback that also catches `completed` website tasks where all phases are approved.

**In `getGroupCategories` (~line 1500):** Same logic — check if a `completed` website task has all phases approved.

**In badge rendering (~line 2250):** Before the "Awaiting Final Review" badge, check if all phases are actually approved — if so, show "Website Completed" instead.

This way, even without the data fix, the UI will correctly identify these orders. The data fix ensures consistency.

