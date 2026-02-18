

# Client Hosting Access Method Workflow

## Overview

When the PM selects "Client Hosting" as the hosting provider in the Launch Website modal, a new set of hosting-specific access method options will appear. These options determine how the developer gets access to the client's hosting account (or whether the client self-launches).

## Current vs. New Modal Flow

Currently, the "Hosting Provider" field only toggles between showing Plex billing fields or nothing. The new flow adds a second layer of options when "Client Hosting" is selected.

```text
Launch Website Modal
  |
  +-- Domain Name (text)
  +-- Access Method (domain-level: credentials, delegate, nameservers, DNS, not required)
  +-- Hosting Provider: [Plex Hosting | Client Hosting]
        |
        +-- If Plex Hosting: billing fields (Total/Paid/Pending) -- unchanged
        |
        +-- If Client Hosting (NEW):
              +-- Hosting Provider Name (text, e.g. "GoDaddy")
              +-- Hosting Access Method:
                    |
                    +-- A) Delegate Access
                    |     -> Shows fixed email: Charley@plexlogo.com
                    |     -> Same delegate workflow as domain (pending -> forwarded -> granted)
                    |
                    +-- B) Hosting Login Credentials
                    |     -> Username + Password fields
                    |
                    +-- C) Client Will Launch Himself (Self-Launch)
                          -> Developer provides WeTransfer link
                          -> PM communicates link to client
                          -> PM marks "Self-Launch Completed"
```

## What Changes

### 1. Database Migration

Add new columns to the `tasks` table:

- `launch_hosting_access_method` (text, nullable) -- values: "hosting_delegate", "hosting_credentials", "self_launch"
- `launch_hosting_provider_name` (text, nullable) -- free text name of client's hosting provider (e.g. "GoDaddy")
- `launch_hosting_delegate_status` (text, nullable) -- tracks: pending_delegation, forwarded_to_client, access_granted (mirrors domain delegate flow)
- `launch_self_launch_status` (text, nullable) -- tracks: pending_link, link_provided, self_launch_completed
- `launch_wetransfer_link` (text, nullable) -- the WeTransfer download link provided by developer

Add new notification types to the `notifications_type_check` constraint:
- `hosting_delegate_request` -- sent to developer when PM initiates hosting delegate flow
- `hosting_delegate_confirmed` -- sent to developer when hosting delegate access is confirmed
- `self_launch_link_request` -- sent to developer to generate WeTransfer link
- `self_launch_completed` -- sent to developer when PM marks self-launch as done

### 2. Launch Modal UI (PMDashboard.tsx and AdminDashboard.tsx)

**New state fields in `launchData`:**
- `hostingAccessMethod` -- "hosting_delegate" | "hosting_credentials" | "self_launch"
- `hostingProviderName` -- text input for provider name
- `hostingCredUsername` -- username for hosting account
- `hostingCredPassword` -- password for hosting account

**When "Client Hosting" is selected:**
1. Show "Hosting Provider Name" text input
2. Show "Hosting Access Method" select with 3 options:
   - "Client will give delegate access"
   - "Client will provide hosting login credentials"
   - "Client will launch himself (Self-Launch)"

**Conditional fields per hosting access method:**
- **Delegate Access**: Read-only info box with Charley@plexlogo.com (identical to domain delegate)
- **Hosting Credentials**: Username + Password inputs
- **Self-Launch**: Info text explaining the WeTransfer process

### 3. Launch Mutation Logic

Update the `launchWebsite` mutation in both PM and Admin dashboards to:
- Save `launch_hosting_access_method`, `launch_hosting_provider_name`
- For hosting credentials: save to `launch_hosting_username` and `launch_hosting_password`
- For hosting delegate: set `launch_hosting_delegate_status = "pending_delegation"` and notify developer
- For self-launch: set `launch_self_launch_status = "pending_link"` and notify developer to generate WeTransfer link

### 4. Task Card Status Sections (PM + Admin Dashboards)

**Hosting Delegate Flow** (mirrors domain delegate):
- `pending_delegation`: Show delegate email + "Access Forwarded to Client" button
- `forwarded_to_client`: Show "Access Granted" button
- `access_granted`: Green confirmation badge

**Self-Launch Flow:**
- `pending_link`: Badge "Awaiting WeTransfer link from developer"
- `link_provided`: Show the WeTransfer link + "Self-Launch Completed" button
- `self_launch_completed`: Green "Self-Launch Completed" badge

Add corresponding mutations: `forwardHostingDelegate`, `confirmHostingDelegate`, `markSelfLaunchCompleted`

### 5. Developer Dashboard (DeveloperDashboard.tsx)

**Hosting Delegate status badges:**
- `pending_delegation`: "Awaiting hosting delegate access from client..."
- `forwarded_to_client`: "PM has contacted client about hosting delegation"
- `access_granted`: "Hosting delegate access confirmed -- proceed"

**Self-Launch section:**
- `pending_link`: Show input field for developer to paste WeTransfer link + "Submit Link" button
- `link_provided`: "WeTransfer link sent to PM -- awaiting client self-launch"
- `self_launch_completed`: "Client has self-launched. Verify the website is live."

Add mutation for developer to submit the WeTransfer link (updates `launch_wetransfer_link` and `launch_self_launch_status = "link_provided"`).

### 6. Notification Bell (NotificationBell.tsx)

Add icons for the 4 new notification types:
- `hosting_delegate_request` -- key icon
- `hosting_delegate_confirmed` -- check icon
- `self_launch_link_request` -- link/download icon
- `self_launch_completed` -- check-circle icon

### 7. Files Modified

1. **New migration** -- add 5 columns to tasks + update notification constraint with 4 new types
2. **PMDashboard.tsx** -- launch modal UI for client hosting options, new status sections on task cards, new mutations
3. **AdminDashboard.tsx** -- mirror all PM changes
4. **DeveloperDashboard.tsx** -- hosting delegate badges, self-launch WeTransfer link input, status badges
5. **NotificationBell.tsx** -- icons for 4 new notification types
6. **types.ts** -- auto-updated after migration

