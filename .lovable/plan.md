

# SLA Reset on Phase Upload

## What Changes

Every time a developer uploads deliverables for any phase (Phase 1, 2, 3, etc.), the SLA timer for that phase will automatically reset to 9 working hours from the upload time. This ensures developers get a fresh 9-hour window each time they submit work for PM review.

## Current Behavior

- Phase 1 is created at order time with an SLA deadline (but incorrectly uses 8 hours instead of 9)
- Uploading files for a phase does NOT reset the SLA timer
- The SLA only resets when the developer moves to the next phase

## New Behavior

- After a developer uploads files for any phase, the system recalculates the SLA deadline to 9 working hours from that moment
- Both the `project_phases` record and the `tasks` record are updated with the new deadline
- Phase 1 creation will also use 9 hours (fixing the current 8-hour value)

---

## Technical Details

### File: `src/components/dashboards/DeveloperDashboard.tsx`

In the `handleFileUpload` function, after files are uploaded and submission records created, add SLA recalculation logic:

1. Fetch the developer's `developer_id` from the task
2. Call the `calculate-sla-deadline` edge function with `sla_hours: 9` and the current time as `start_time`
3. Update the `project_phases` record for the current phase with the new `sla_deadline`
4. Update the `tasks` record with the new `sla_deadline`

This happens for every upload, whether it is Phase 1 or any subsequent phase.

### File: `src/components/dashboards/CreateWebsiteOrderForm.tsx`

Fix Phase 1 creation to use `sla_hours: 9` instead of `sla_hours: 8` (line 255).

### No database migration needed

The `sla_deadline` columns already exist on both `project_phases` and `tasks`.

