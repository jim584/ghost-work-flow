

# Replace "Approve" with "Launch Website" for Website Orders

## Problem
For website orders, the current "Approve" button simply sets the task status to `approved`, which doesn't reflect the real-world workflow. After a developer marks a website as completed, the PM needs to send it for launch -- not just "approve" it. The developer also needs to be notified that it's time to launch.

## Solution

Replace the generic "Approve" button with a **"Launch Website"** button specifically for completed website orders. This button will:
1. Set the task status to `approved` (reusing the existing status since adding a new enum value is unnecessary complexity)
2. Send an in-app notification to the developer assigned to the website, informing them that the website needs to be launched
3. Show a distinct rocket icon and blue styling to differentiate it from a simple approval

Non-website orders (logo, social media) keep the existing "Approve" button unchanged.

## Technical Details

### File: `src/components/dashboards/PMDashboard.tsx`

**1. Update the button rendering (~line 1895)**

Currently:
```
if task.status === "completed" && task.project_manager_id === user?.id
  -> Show "Approve" button
```

Change to:
```
if task.status === "completed" && task.project_manager_id === user?.id
  -> If website order: Show "Launch Website" button (Rocket icon, blue styling)
  -> If non-website order: Show "Approve" button (unchanged)
```

**2. Create a new mutation `launchWebsite`**

This mutation will:
- Update the task status to `approved` (same as current approve)
- Look up the developer assigned to the task (via `task.developer_id` or team members)
- Insert a notification into the `notifications` table for the developer with:
  - `type`: `'new_task'` (reusing an existing allowed type since the constraint limits options)
  - `title`: `'Website Ready for Launch'`
  - `message`: `'[Task title] has been approved and is ready for launch'`
  - `task_id`: the task ID

**3. Notification type consideration**

The `notifications` table has a check constraint limiting types to: `new_task`, `revision_requested`, `task_delayed`, `file_uploaded`, `order_cancelled`, `late_acknowledgement`, `reassignment_requested`, `order_message`. 

A new type `website_launch` would be more descriptive. This requires a database migration to add it to the constraint.

### Database Migration

Add `website_launch` to the `notifications_type_check` constraint:

```sql
ALTER TABLE notifications DROP CONSTRAINT notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check 
  CHECK (type IN ('new_task', 'revision_requested', 'task_delayed', 'file_uploaded', 
                  'order_cancelled', 'late_acknowledgement', 'reassignment_requested', 
                  'order_message', 'website_launch'));
```

### Result

- **Website orders** (status = completed): Blue "Launch Website" button with Rocket icon. Clicking it sets status to `approved` and notifies the developer.
- **Non-website orders** (status = completed): Green "Approve" button remains unchanged.
- **Developer receives** an in-app notification (bell icon + sound) saying the website is ready for launch.

