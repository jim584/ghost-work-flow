

# Order-Specific Chat System with Priority Indicators

## Overview

Add a real-time messaging system embedded within each order card, allowing developers, project managers, and admins to communicate directly about a specific order. Messages trigger priority indicators on the recipient's dashboard.

---

## Database Changes

### New Table: `order_messages`

| Column | Type | Description |
|--------|------|-------------|
| id | uuid (PK) | Auto-generated |
| task_id | uuid (FK) | Links to the order/task |
| sender_id | uuid | The user who sent the message |
| message | text | Message content |
| file_path | text (nullable) | Optional file attachment path in storage |
| file_name | text (nullable) | Original file name |
| parent_message_id | uuid (nullable) | For threading -- references another message |
| status | text | "pending" or "resolved" (default: "pending") |
| created_at | timestamptz | Auto-set |

### New Table: `order_message_reads`

Tracks which users have seen messages, used to determine priority indicators.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid (PK) | Auto-generated |
| message_id | uuid (FK) | References order_messages |
| user_id | uuid | The user who read the message |
| read_at | timestamptz | When they read it |

### Realtime

Enable realtime on `order_messages` so new messages appear instantly.

### New Column on `tasks`: `has_unread_messages` (NOT added)

Instead, unread status will be computed client-side by comparing `order_messages` vs `order_message_reads` for the current user. This avoids complex trigger logic and keeps the source of truth in the read-tracking table.

### RLS Policies

**order_messages:**
- Developers: SELECT/INSERT on messages for tasks in their teams
- PMs: SELECT/INSERT on messages for their tasks (project_manager_id = auth.uid()) or all tasks
- Admins: Full access (ALL)
- Dev team leaders: SELECT/INSERT on all messages
- UPDATE (status field): PMs and admins can mark messages as resolved

**order_message_reads:**
- Users can INSERT/SELECT their own read records
- Admins can view all

### Notification Type

Add `'order_message'` to the `notifications_type_check` constraint so new message notifications can be stored.

---

## New Component: `OrderChat`

A reusable chat component that takes a `taskId` and renders inside a Dialog or collapsible section on the order card.

**Features:**
- Scrollable message list with sender name, timestamp, and optional file attachment
- Reply/thread support: click "Reply" on a message to set it as parent
- Input area with text field, optional file upload, and Send button
- Messages grouped by date
- "Resolved" / "Pending" badge on each message, toggleable by PM/Admin
- Auto-marks messages as read when the chat dialog is opened
- Realtime subscription for new messages

---

## Priority Indicator Logic

**How it works:**
1. When a developer sends a message, the system creates a notification for the PM (and admin)
2. When a PM sends a message, the system creates a notification for developers in that team
3. Each dashboard queries `order_message_reads` to find orders with unread messages from the other party
4. Orders with unread messages show a visual "priority" badge (e.g., pulsing dot or highlighted border)
5. Opening the chat dialog marks all messages as read, removing the priority indicator

**Dashboard integration:**
- Developer Dashboard: order cards show priority when PM/admin has sent unread messages
- PM Dashboard: order cards show priority when developer has sent unread messages
- Admin Dashboard: order cards show priority when any party has sent unread messages

---

## UI Integration

### Order Card Changes (all 3 dashboards)

- Add a "Chat" or message icon button on each order card
- Show an unread message count badge on the button
- Clicking opens a Dialog with the `OrderChat` component
- Cards with unread messages get a subtle highlight border or a "New Message" badge

### Chat Dialog Layout

```text
+----------------------------------+
|  Chat - Order #123               |
|  "Website for ABC Corp"          |
+----------------------------------+
|  [Date separator: Feb 12, 2026]  |
|                                  |
|  PM John (2:30 PM)         [Pending]
|  > Please update the homepage    |
|    [reply] [mark resolved]       |
|                                  |
|  Dev Sarah (3:15 PM)             |
|  > Done, check the updated URL   |
|    attachment.pdf [download]     |
|    [reply]                       |
|                                  |
+----------------------------------+
|  Reply to: "Please update..."  X |
|  [Message input...............]  |
|  [Attach file]        [Send]     |
+----------------------------------+
```

---

## Files to Create/Modify

### New Files
- `src/components/OrderChat.tsx` -- The chat component with message list, input, file upload, threading, and realtime subscription

### Modified Files
- `src/components/dashboards/DeveloperDashboard.tsx` -- Add chat button to order cards, unread message query, priority indicator
- `src/components/dashboards/PMDashboard.tsx` -- Add chat button to order cards, unread message query, priority indicator
- `src/components/dashboards/AdminDashboard.tsx` -- Add chat button to order cards, unread message query, priority indicator

### Database Migration
- Create `order_messages` table with RLS
- Create `order_message_reads` table with RLS
- Add `'order_message'` to `notifications_type_check` constraint
- Enable realtime on `order_messages`

---

## Implementation Sequence

1. Database migration (tables, RLS, realtime, notification type)
2. Create `OrderChat` component
3. Integrate into Developer Dashboard with priority indicators
4. Integrate into PM Dashboard with priority indicators
5. Integrate into Admin Dashboard with priority indicators

