

# Delegate Access Workflow

## Overview

When a PM selects "Client will delegate access" during website launch, a multi-step workflow will guide the PM through communicating delegate access instructions to the client, then confirming access was granted before the developer can proceed.

## Workflow Steps

```text
PM submits launch form (delegate selected)
        |
        v
Task status -> "approved"
launch_delegate_status = "pending_delegation"
Auto-display: "Client must delegate access to Charley@plexLogo.com"
Developer gets notification: "Verify delegate access for [domain]"
        |
        v
PM calls client, explains delegation to Charley@plexLogo.com
PM clicks "Access Forwarded to Client"
launch_delegate_status -> "forwarded_to_client"
        |
        v
Client confirms delegation done
PM clicks "Access Granted"
launch_delegate_status -> "access_granted"
Developer gets notification: "Delegate access granted for [domain], proceed with launch"
        |
        v
Developer proceeds with normal launch flow
```

## What Changes

### 1. Database Migration

Add a new column to the `tasks` table:
- `launch_delegate_status` (text, nullable) -- tracks: pending_delegation, forwarded_to_client, access_granted

Add new notification types to the constraint:
- `delegate_request` -- sent to developer when PM initiates delegate flow
- `delegate_confirmed` -- sent to developer when PM confirms access granted

### 2. PM Dashboard (PMDashboard.tsx)

**Launch form (when accessMethod = "delegate"):**
- Show a read-only info box: "The client will need to provide delegate access to Charley@plexLogo.com" with the email pre-filled and non-editable

**Launch submission:**
- Sets `launch_delegate_status = "pending_delegation"`
- Sends `delegate_request` notification to the developer

**Task card display (for delegate-flow tasks):**
- `pending_delegation`: Show delegate email info + "Access Forwarded to Client" button
- `forwarded_to_client`: Show "Access Granted" button (PM clicks after client confirms)
- `access_granted`: Show green confirmation badge

### 3. Admin Dashboard (AdminDashboard.tsx)

Mirror the same delegate status section and action buttons (Forward to Client, Access Granted) as in the PM Dashboard.

### 4. Developer Dashboard (DeveloperDashboard.tsx)

Show status badges for delegate-flow tasks:
- `pending_delegation`: "Awaiting delegate access from client..."
- `forwarded_to_client`: "PM has contacted client about delegation"
- `access_granted`: "Delegate access confirmed -- proceed with launch"

No input form needed (unlike nameserver/DNS flows) since the email is fixed.

### 5. Notification Bell (NotificationBell.tsx)

Add icons for the 2 new notification types:
- `delegate_request` -> key/shield icon
- `delegate_confirmed` -> checkmark icon

### 6. Files Modified

1. New database migration -- add `launch_delegate_status` column + update notification constraint
2. `PMDashboard.tsx` -- delegate info box in modal, launch logic, status section with action buttons
3. `AdminDashboard.tsx` -- matching delegate status section and action buttons
4. `DeveloperDashboard.tsx` -- status badges for delegate flow
5. `NotificationBell.tsx` -- icons for `delegate_request` and `delegate_confirmed`

