

# Resource-Based Availability Calendar and SLA Engine

## Overview

Build a per-developer availability calendar system that calculates SLA deadlines using individual working schedules (not company-wide hours). The system supports 8 working-hour SLA per phase, round-robin assignment, leave tracking, and a 30-working-minute acknowledgement window.

---

## Step 1: Database Schema (Migrations)

### A) New `availability_calendars` Table

| Column | Type | Default |
|--------|------|---------|
| id | uuid PK | gen_random_uuid() |
| name | text NOT NULL | -- |
| timezone | text NOT NULL | 'Asia/Karachi' |
| working_days | integer[] NOT NULL | {1,2,3,4,5,6} (Mon-Sat) |
| start_time | time NOT NULL | '10:00' |
| end_time | time NOT NULL | '19:00' |
| created_at | timestamptz | now() |
| updated_at | timestamptz | now() |

### B) New `developers` Table

| Column | Type | Default |
|--------|------|---------|
| id | uuid PK | gen_random_uuid() |
| user_id | uuid UNIQUE NOT NULL | FK -> profiles.id |
| name | text NOT NULL | -- |
| timezone | text NOT NULL | 'Asia/Karachi' |
| availability_calendar_id | uuid NOT NULL | FK -> availability_calendars.id |
| is_active | boolean NOT NULL | true |
| round_robin_position | integer NOT NULL | -- |
| created_at | timestamptz | now() |
| updated_at | timestamptz | now() |

### C) New `leave_records` Table

| Column | Type | Default |
|--------|------|---------|
| id | uuid PK | gen_random_uuid() |
| developer_id | uuid NOT NULL | FK -> developers.id |
| leave_start_datetime | timestamptz NOT NULL | -- |
| leave_end_datetime | timestamptz NOT NULL | -- |
| reason | text | -- |
| status | text NOT NULL | 'pending' |
| created_by | uuid | -- |
| created_at | timestamptz | now() |

### D) New `project_phases` Table

| Column | Type | Default |
|--------|------|---------|
| id | uuid PK | gen_random_uuid() |
| task_id | uuid NOT NULL | FK -> tasks.id |
| phase_number | integer NOT NULL | -- |
| sla_hours | integer NOT NULL | 8 |
| sla_deadline | timestamptz | -- |
| started_at | timestamptz | -- |
| completed_at | timestamptz | -- |
| status | text NOT NULL | 'pending' |
| created_at | timestamptz | now() |

### E) New Columns on `tasks` Table

- `developer_id` (uuid, FK -> developers.id, nullable)
- `acknowledged_at` (timestamptz, nullable)
- `current_phase` (integer, default 1)
- `total_phases` (integer, default 4)
- `sla_deadline` (timestamptz, nullable)

### F) Add `assigned` to `task_status` Enum

Add `'assigned'` to the existing `task_status` enum so website orders start as "Assigned - Awaiting Acknowledgement."

### G) Seed Default Calendar

Insert one default calendar: "Standard PK Shift" with Mon-Sat, 10:00-19:00, Asia/Karachi.

### H) RLS Policies

- **availability_calendars**: Admins full CRUD; PMs and developers SELECT only
- **developers**: Admins full CRUD; PMs SELECT; developers SELECT own record
- **leave_records**: Admins full CRUD; PMs SELECT; developers SELECT own records
- **project_phases**: Mirror task access patterns (admins full, PMs view all, developers view own team's)

### I) Updated Round-Robin RPC

Create `get_next_available_developer()` that:
1. Queries `developers` where `is_active = true`, ordered by `round_robin_position`
2. Uses `website_order_assignment.last_assigned_index` as pointer
3. Returns developer `id`, `user_id`, and looks up their `team_id` from `team_members`
4. Updates the pointer

---

## Step 2: SLA Calculation Edge Function

### `calculate-sla-deadline`

A backend function that accepts `developer_id`, `start_time`, and `sla_hours` (default 8).

**Algorithm:**
1. Fetch developer's `availability_calendar` (working_days, start_time, end_time, timezone)
2. Fetch approved `leave_records` for this developer in the relevant window
3. Convert assignment time to developer's timezone
4. If currently outside working hours, advance to next working period start
5. Accumulate working hours day by day:
   - For each working day, calculate available hours (calendar hours minus leave overlap)
   - Skip non-working days
   - Continue until 8 hours are fully accumulated
6. Return the calculated deadline timestamp (in UTC)

This function is called when:
- A website order is assigned (Phase 1 SLA)
- A phase is completed and the next phase begins

---

## Step 3: Website Order Assignment Flow Update

### Changes to `CreateWebsiteOrderForm.tsx`

When creating a website order:
1. Call `get_next_available_developer()` instead of `get_next_developer_team()`
2. Set `developer_id` on the task
3. Set task status to `'assigned'` (new enum value)
4. Call `calculate-sla-deadline` edge function to compute Phase 1 deadline
5. Create Phase 1 record in `project_phases` with the calculated deadline
6. Store `sla_deadline` on the task for quick access

---

## Step 4: Developer Dashboard Updates

### Acknowledgement Flow
- Tasks in `'assigned'` status show an "Acknowledge" button
- Clicking sets `acknowledged_at` and transitions status to `'pending'`
- SLA timer is already running regardless of acknowledgement

### Phase Progress Display
- Show current phase indicator (e.g., "Phase 1/4 - Homepage")
- Phase labels: Phase 1 = Homepage (1 page), Phase 2-4 = 3 inner pages each
- SLA countdown timer showing remaining working hours until deadline

### File Upload Per Phase
- Upload label changes based on current phase
- On upload, mark current phase as completed, advance `current_phase`, and calculate next phase SLA

---

## Step 5: Admin Dashboard - Availability Management

### New "Developer Resources" Section (new tab or collapsible area)

**A) Availability Calendars Manager**
- List all calendars (name, timezone, working days, hours)
- Create/edit calendar form
- Cannot delete calendars in use

**B) Developer Configuration**
- List developers with name, timezone, calendar, position, active status
- Edit developer settings
- Toggle active/inactive

**C) Leave Management**
- List leave records with developer, dates, reason, status
- Approve/reject pending leaves
- Create leave for a developer

---

## Step 6: Acknowledgement Timeout Check

### Update `check-delayed-tasks` Edge Function

Add logic to check for unacknowledged website orders:
1. Find tasks where `status = 'assigned'`, `acknowledged_at IS NULL`, and `post_type = 'Website Design'`
2. For each, calculate 30 working minutes using the developer's calendar
3. If 30 working minutes have passed:
   - Notify admins (Development Head)
   - Notify the task's project manager
   - Add notification type `'acknowledgement_overdue'` (requires adding to notifications check constraint)

### Database: Update Notification Type Constraint

Add `'acknowledgement_overdue'` to the `notifications_type_check` constraint.

---

## Step 7: PM Dashboard Updates

- Show SLA deadline and phase info on website order cards
- Show acknowledgement status (acknowledged vs awaiting)
- Phase progress indicator

---

## New Files

| File | Purpose |
|------|---------|
| `src/components/admin/AvailabilityCalendarsManager.tsx` | Admin UI for calendar CRUD |
| `src/components/admin/DeveloperResourcesManager.tsx` | Admin UI for developer config |
| `src/components/admin/LeaveManagement.tsx` | Admin UI for leave records |
| `src/components/developer/PhaseProgress.tsx` | Phase indicator component |
| `src/components/developer/SLACountdown.tsx` | Countdown timer component |
| `src/hooks/useAvailabilityCalendars.ts` | Query hook for calendars |
| `src/hooks/useDeveloperResource.ts` | Query hook for developer config |
| `supabase/functions/calculate-sla-deadline/index.ts` | SLA calculation engine |

## Modified Files

| File | Changes |
|------|---------|
| `src/components/dashboards/AdminDashboard.tsx` | Add Developer Resources section with 3 sub-managers |
| `src/components/dashboards/DeveloperDashboard.tsx` | Add acknowledge flow, phase progress, SLA countdown |
| `src/components/dashboards/PMDashboard.tsx` | Show SLA/phase info on website cards |
| `src/components/dashboards/CreateWebsiteOrderForm.tsx` | Use new assignment RPC, set developer_id, call SLA function |
| `supabase/functions/check-delayed-tasks/index.ts` | Add acknowledgement timeout check |

---

## Implementation Order

1. Database migrations (tables, columns, enum, RLS, seed, new RPC)
2. `calculate-sla-deadline` edge function
3. Admin UI: Calendar manager, Developer resources, Leave management
4. Update `CreateWebsiteOrderForm` with new assignment + SLA flow
5. Update Developer Dashboard (acknowledge, phase progress, SLA countdown)
6. Update PM Dashboard (SLA/phase display)
7. Update `check-delayed-tasks` for acknowledgement timeout
8. Add `'acknowledgement_overdue'` to notification type constraint

