
# Add PM Notifications for Designer File Uploads

## Overview
Implement a notification system so Project Managers are immediately alerted when designers upload files to their tasks. Tasks will appear in Priority View with pending submissions, and PMs will receive real-time notifications.

## Current Flow vs. Proposed Flow

### Current (No PM Notifications)
```text
Designer uploads file → Submission created (pending_review) → Task appears in Priority View
                                                              ↳ PM must manually check dashboard
```

### Proposed (With PM Notifications)
```text
Designer uploads file → Submission created (pending_review) → Database trigger fires
                                                              ↳ Creates notification for PM
                                                              ↳ PM sees notification bell alert
                                                              ↳ Task appears in Priority View
```

## Implementation Plan

### 1. Database Migration: Create Submission Notification Trigger

Create a new database function and trigger that fires when a designer uploads files:

```sql
-- Function to notify PM when designer uploads files
CREATE OR REPLACE FUNCTION public.create_submission_notifications()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  task_record RECORD;
  designer_name TEXT;
BEGIN
  -- Get task details including PM
  SELECT t.id, t.title, t.project_manager_id
  INTO task_record
  FROM tasks t
  WHERE t.id = NEW.task_id;
  
  -- Get designer name
  SELECT COALESCE(full_name, email) INTO designer_name
  FROM profiles WHERE id = NEW.designer_id;
  
  -- Create in-app notification for the PM
  INSERT INTO public.notifications (user_id, type, title, message, task_id)
  VALUES (
    task_record.project_manager_id,
    'file_uploaded',
    'New File Uploaded',
    'Designer ' || COALESCE(designer_name, 'Unknown') || 
    ' uploaded a file for: ' || task_record.title,
    NEW.task_id
  );
  
  RETURN NEW;
END;
$$;

-- Create trigger on design_submissions table
CREATE TRIGGER on_submission_created
  AFTER INSERT ON public.design_submissions
  FOR EACH ROW
  EXECUTE FUNCTION public.create_submission_notifications();
```

### 2. Add NotificationBell to PM Dashboard

**File:** `src/components/dashboards/PMDashboard.tsx`

Add import at top of file:
```tsx
import { NotificationBell } from "@/components/NotificationBell";
```

Add NotificationBell component in header (before Sign Out button, around line 687):
```tsx
<div className="flex items-center gap-4">
  {/* ...existing stats display... */}
  <NotificationBell userId={user!.id} />  {/* ADD THIS */}
  <Button onClick={signOut} variant="outline" size="sm">
    <LogOut className="mr-2 h-4 w-4" />
    Sign Out
  </Button>
</div>
```

### 3. Add Icon Mapping for New Notification Type

**File:** `src/components/NotificationBell.tsx`

Update the `getNotificationIcon` function (around line 310):
```tsx
const getNotificationIcon = (type: string) => {
  switch (type) {
    case 'new_task':
      return '🆕';
    case 'revision_requested':
      return '🔄';
    case 'task_delayed':
      return '⚠️';
    case 'file_uploaded':   // ADD THIS
      return '📤';
    default:
      return '📢';
  }
};
```

## How It Works After Implementation

1. **Designer uploads file** (initial, revision, or additional via "Add Files")
2. **Database trigger fires** → Creates notification for the PM
3. **PM receives real-time notification**:
   - Bell icon shows unread count badge
   - Sound alert plays
   - Toast notification appears
   - Tab title flashes if not focused
   - Desktop notification if permitted
4. **Task appears in Priority View** under "Recently Delivered"
5. **PM reviews and approves** → Task moves out of Priority View

## Summary of Changes

| File | Change |
|------|--------|
| Database | Add `create_submission_notifications()` function and `on_submission_created` trigger |
| `PMDashboard.tsx` | Add NotificationBell component import and usage in header |
| `NotificationBell.tsx` | Add `file_uploaded` case to icon mapping |

## User Experience
- PMs will be immediately notified when any file is uploaded
- Notification message clearly states which designer uploaded and for which task
- Clicking notification opens the task in Priority View (already showing in "Recently Delivered")
- Once all submissions are approved, task moves to "All Tasks"
