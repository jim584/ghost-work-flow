

# DNS Records Provisioning Workflow

## Overview

Add a workflow for the "Client will update DNS records" access method, mirroring the existing nameserver provisioning flow. When a PM selects this option during website launch, the developer will provide DNS record values (A record, CNAME, MX records) that the PM forwards to the client.

## Workflow

```text
PM submits launch form (dns_records selected)
        |
        v
Task status -> "approved", launch_dns_status = "pending_dns"
Developer gets notification: "Provide DNS records for [domain]"
        |
        v
Developer enters A Record, CNAME, MX Record and submits
launch_dns_status -> "dns_provided"
PM gets notification: "DNS records for [domain] are ready"
        |
        v
PM reviews DNS records (read-only) and clicks "Forward to Client"
launch_dns_status -> "dns_forwarded_to_client"
        |
        v
PM clicks "DNS Records Confirmed" after client updates
launch_dns_status -> "dns_confirmed"
Developer gets notification: "DNS records updated, proceed with launch"
        |
        v
Developer proceeds with normal launch flow
```

## What Changes

### 1. Database Migration

Add new columns to the `tasks` table:
- `launch_dns_status` (text, nullable) -- tracks workflow stage
- `launch_dns_a_record` (text, nullable) -- A record / IP address
- `launch_dns_cname` (text, nullable) -- CNAME record
- `launch_dns_mx_record` (text, nullable) -- MX record

Add new notification types to the constraint:
- `dns_request` -- sent to developer when PM initiates DNS flow
- `dns_ready` -- sent to PM when developer provides DNS records
- `dns_confirmed` -- sent to developer when PM confirms client updated DNS

### 2. PM Dashboard Changes (PMDashboard.tsx)

**Launch form submission (when accessMethod = "dns_records"):**
- Sets `launch_dns_status = "pending_dns"` on the task
- Sends a `dns_request` notification to the developer

**Task card display (for DNS-flow tasks):**
- `pending_dns`: Show "Awaiting DNS records from developer..."
- `dns_provided`: Show A record, CNAME, MX values read-only with "Forward to Client" button
- `dns_forwarded_to_client`: Show "DNS Records Confirmed" button
- `dns_confirmed`: Show confirmation badge

**New mutations:** `forwardDnsRecords` and `confirmDnsRecords` (parallel to nameserver mutations)

### 3. Developer Dashboard Changes (DeveloperDashboard.tsx)

**For tasks with `launch_access_method = "dns_records"` and `launch_dns_status = "pending_dns"`:**
- Show 3 input fields: A Record (IP Address), CNAME Record, MX Record -- A Record is required, others optional
- "Submit DNS Records" button

**After submission:**
- Updates `launch_dns_a_record`, `launch_dns_cname`, `launch_dns_mx_record`
- Sets `launch_dns_status = "dns_provided"`
- Sends `dns_ready` notification to PM

**Status badges for `dns_provided`/`dns_forwarded_to_client`/`dns_confirmed`**

### 4. Notification Bell (NotificationBell.tsx)

Add icons for new notification types:
- `dns_request` -> globe icon
- `dns_ready` -> checkmark
- `dns_confirmed` -> rocket

### 5. Files Modified

1. **Database migration** -- new columns + updated notification constraint
2. **PMDashboard.tsx** -- launch logic, mutations, task card display
3. **DeveloperDashboard.tsx** -- DNS input form, submit mutation, status display
4. **NotificationBell.tsx** -- icons for 3 new notification types

