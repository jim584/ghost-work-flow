

## Problem

After the PM clicks "Launch Website" and submits the launch dialog, the task status changes to `approved` and various launch workflow statuses are set (e.g., `launch_nameserver_status: "pending_nameservers"`, `launch_dns_status: "pending_dns"`, etc.). However, the task disappears from the Priority Dashboard because:

1. It no longer qualifies as `awaiting_launch` (that requires `launch_website_live_at` to be null AND no launch data set -- but now launch data IS set, and status is `approved`)
2. Line 1574 catches it as `allApproved` → `other`, or line 1589 catches `status === 'approved'` → `other`

The task gets buried in "All Tasks" during the active launch workflow.

## Fix

### `PMDashboard.tsx` — Add "launch in progress" to priority categorization

**Single-task categorization** (~line 1577-1588): Before the `awaiting_launch` check, add a new condition that detects tasks in an active launch workflow (status `approved`, launch data submitted via `launch_domain` being set, but `launch_website_live_at` is still null). Categorize these as `pending_delivery` so they appear in the priority view with launch status visibility.

**Multi-team categorization** (~line 1501-1510): Add the same detection logic in `getGroupCategories` so multi-team orders also surface.

**Priority filter** (line 1674-1676): `pending_delivery` is already included in the priority filter list, so no change needed there.

The detection condition:
```
task.post_type === 'Website Design' 
  && task.status === 'approved' 
  && task.launch_domain          // launch has been submitted
  && !task.launch_website_live_at // not yet live
```

This ensures that once the PM submits the launch dialog, the order stays visible in the Priority Dashboard until the developer marks it live.

