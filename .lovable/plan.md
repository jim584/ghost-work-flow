

# Nameserver Provisioning Workflow for Website Launch

## Overview

When a PM selects "Client will change nameservers" as the access method during website launch, a multi-step collaborative workflow kicks in between the PM and Developer to provision, share, and confirm nameservers before the actual launch.

## Current Behavior

Today, selecting any access method and clicking "Launch Website" immediately sets the task status to `approved` and sends a generic "Website Ready for Launch" notification to the developer. There is no intermediate step for the developer to provide nameservers back to the PM.

## Proposed Workflow

```text
PM submits launch form (nameservers selected)
        |
        v
Task status -> "approved", launch_nameserver_status = "pending_nameservers"
Developer gets notification: "Provide nameservers for [domain]"
        |
        v
Developer enters NS1-NS4 and submits
launch_nameserver_status -> "nameservers_provided"
PM gets notification: "Nameservers ready for [domain]"
        |
        v
PM reviews nameservers (read-only) and clicks "Forward to Client"
launch_nameserver_status -> "forwarded_to_client"
        |
        v
PM clicks "Nameservers Confirmed" after client updates
launch_nameserver_status -> "nameservers_confirmed"
Developer gets notification: "Nameservers updated, proceed with launch"
        |
        v
Developer proceeds with normal launch flow
```

## What Changes

### 1. Database Migration

Add new columns to the `tasks` table:

- `launch_nameserver_status` (text, nullable) -- tracks the workflow stage: `pending_nameservers`, `nameservers_provided`, `forwarded_to_client`, `nameservers_confirmed`
- `launch_nameserver_1` through `launch_nameserver_4` (text, nullable) -- stores the nameserver values provided by the developer

Also add `nameserver_provided` and `nameserver_confirmed` to the `notifications_type_check` constraint.

### 2. PM Dashboard Changes (PMDashboard.tsx)

**Launch form submission (when accessMethod = "nameservers"):**
- Sets `launch_nameserver_status = "pending_nameservers"` on the task
- Sends a notification to the developer: "Provide Nameservers for [Domain Name]" with type `nameserver_provided` (we reuse the notification types slightly -- actually we will use the allowed types or add new ones)

**Task card display (for nameserver-flow tasks):**
- When `launch_nameserver_status = "nameservers_provided"`: Show the 4 nameservers read-only with a "Forward to Client" button
- When `launch_nameserver_status = "forwarded_to_client"`: Show a "Nameservers Confirmed" button (PM clicks after client confirms)
- When `launch_nameserver_status = "nameservers_confirmed"`: Show a badge "Nameservers Confirmed -- Awaiting Launch"

### 3. Developer Dashboard Changes (DeveloperDashboard.tsx)

**For tasks with `launch_access_method = "nameservers"` and `launch_nameserver_status = "pending_nameservers"`:**
- Show a section titled "Provide Nameservers for [domain]"
- 4 text input fields (Primary NS, Secondary NS, NS3, NS4 -- last two optional)
- "Submit Nameservers" button

**After submission:**
- Updates `launch_nameserver_1`-`4` on the task
- Sets `launch_nameserver_status = "nameservers_provided"`
- Sends notification to PM

**When `launch_nameserver_status = "nameservers_confirmed"`:**
- Developer sees a notification/badge that nameservers are confirmed and they can proceed with launch

### 4. Notification Constraint Update

Add new notification types to the `notifications_type_check` constraint:
- `nameserver_request` -- sent to developer when PM initiates nameserver flow
- `nameserver_ready` -- sent to PM when developer provides nameservers
- `nameserver_confirmed` -- sent to developer when PM confirms client updated nameservers

### 5. Notification Flow

| Step | Trigger | Recipient | Type | Message |
|------|---------|-----------|------|---------|
| PM launches with nameservers | PM clicks Launch | Developer | `nameserver_request` | "Provide nameservers for [domain]" |
| Developer submits nameservers | Dev clicks Submit | PM | `nameserver_ready` | "Nameservers for [domain] are ready" |
| PM confirms nameservers updated | PM clicks Confirmed | Developer | `nameserver_confirmed` | "Nameservers updated, proceed with launch" |

## Technical Details

### Database Migration SQL

```sql
ALTER TABLE tasks 
  ADD COLUMN launch_nameserver_status text,
  ADD COLUMN launch_nameserver_1 text,
  ADD COLUMN launch_nameserver_2 text,
  ADD COLUMN launch_nameserver_3 text,
  ADD COLUMN launch_nameserver_4 text;

ALTER TABLE notifications 
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE notifications 
  ADD CONSTRAINT notifications_type_check 
  CHECK (type IN (
    'new_task', 'revision_requested', 'task_delayed', 'file_uploaded', 
    'order_cancelled', 'late_acknowledgement', 'reassignment_requested', 
    'order_message', 'website_launch', 'task_started',
    'nameserver_request', 'nameserver_ready', 'nameserver_confirmed'
  ));
```

### Files Modified

1. **PMDashboard.tsx** -- Launch mutation logic (conditional on nameservers), new nameserver status display section on task cards, "Forward to Client" and "Nameservers Confirmed" buttons with mutations
2. **DeveloperDashboard.tsx** -- Nameserver input section for approved tasks awaiting nameservers, submit mutation, status display
3. **NotificationBell.tsx** -- Add icons for new notification types (`nameserver_request` -> server icon, `nameserver_ready` -> checkmark, `nameserver_confirmed` -> rocket)

### State Machine for `launch_nameserver_status`

```text
null --> pending_nameservers --> nameservers_provided --> forwarded_to_client --> nameservers_confirmed
```

### Edge Cases

- NS3 and NS4 are optional (some providers only use 2 nameservers)
- If PM changes access method away from nameservers, the nameserver columns remain null
- The "Forward to Client" step is a manual PM action (no automated email) -- PM copies the nameservers and communicates with the client outside the system
- The existing chat system can be used for PM-developer communication about nameserver details

