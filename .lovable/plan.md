

# Phase Submission and Approval Process

## Summary

Introduce a 3-option approval system for PMs reviewing website phases (Approve / Approve with Changes / Disapprove with Changes), with associated change timers that run alongside phase SLA timers on the developer dashboard. Developers are blocked from advancing to the next phase when a phase is disapproved.

---

## Database Changes

### A) New columns on `project_phases` table

| Column | Type | Default | Purpose |
|--------|------|---------|---------|
| `review_status` | text | NULL | 'approved', 'approved_with_changes', 'disapproved_with_changes', or NULL (pending review) |
| `review_comment` | text | NULL | PM's feedback/comments |
| `reviewed_at` | timestamptz | NULL | When the PM reviewed |
| `reviewed_by` | uuid | NULL | PM who reviewed |
| `change_severity` | text | NULL | 'minor' (2h), 'average' (4h), 'major' (9h), 'major_major' (18h) |
| `change_deadline` | timestamptz | NULL | SLA deadline for the changes |
| `change_completed_at` | timestamptz | NULL | When developer marks changes done |

### B) New `phase_review_status` on `tasks` table

No new columns needed -- the existing `project_phases` records will carry the review state per phase. The task's `current_phase` and `status` fields already handle workflow progression.

---

## How It Works

### PM Workflow (on Website Order cards)

When a phase has submissions (status = "in_progress" or "completed"), the PM sees three buttons per phase:

1. **Approve** -- Sets `review_status = 'approved'`. Developer proceeds normally.

2. **Approve with Changes** -- PM selects a change severity (minor/average/major/major_major) and leaves a comment. Developer can continue to the next phase while also working on the changes. A change timer runs alongside the phase timer.

3. **Disapprove with Changes** -- PM selects a change severity and leaves a required comment. Developer is **blocked** from advancing to the next phase until changes are completed. The current phase status reverts to show "Changes Required."

### Developer Workflow

- **Approved**: Developer sees a green "Approved" badge on the phase. Normal workflow continues.

- **Approved with Changes**: Developer sees an amber "Changes Needed" badge with a countdown timer. They can still upload the next phase. A separate button lets them mark changes as complete.

- **Disapproved with Changes**: Developer sees a red "Changes Required" badge with a countdown timer. The "Move to Next Phase" and "Complete Website" buttons are hidden. Only "Upload Changes" is available. Once changes are uploaded and the PM re-reviews, the developer can proceed.

### Change Timers

| Severity | Hours | Description |
|----------|-------|-------------|
| Minor | 2 | Small tweaks |
| Average | 4 | Moderate changes |
| Major | 9 | Significant rework (1 working day) |
| Major Major | 18 | Extensive rework (2 working days, PM extends) |

Timers use the same working-hours engine as the SLA timer (developer's availability calendar, leaves, pause outside working hours).

---

## Implementation Steps

### Step 1: Database Migration

Add the 7 new columns to `project_phases`. No new tables needed.

### Step 2: PM Dashboard -- Phase Review UI

For website orders, add a phase review section in the expanded card view:

- Fetch `project_phases` for each website task
- Show each phase with its status and submissions
- For phases with submissions (in_progress/completed), show the 3 approval buttons
- Clicking "Approve with Changes" or "Disapprove" opens a dialog with:
  - Required comment textarea
  - Severity selector (Minor 2h / Average 4h / Major 9h / Major Major 18h)
  - Submit button
- On submit: update the `project_phases` record and call `calculate-sla-deadline` for the change timer

### Step 3: Developer Dashboard -- Change Indicators and Blocking

- Show review status badges on each phase in the PhaseProgress component
- When a phase is "disapproved_with_changes":
  - Hide "Move to Next Phase" and "Complete Website" buttons
  - Show "Upload Changes" button instead
  - Display change timer countdown
- When a phase is "approved_with_changes":
  - Show change timer alongside phase SLA timer
  - Allow normal phase progression
  - Add "Mark Changes Complete" button
- When changes are uploaded for a disapproved phase, reset the review_status to NULL (pending re-review)

### Step 4: Edge Function Update

Update `calculate-sla-deadline` to accept custom `sla_hours` values (2, 4, 9, 18) for change timers -- it already supports this via the `sla_hours` parameter.

### Step 5: Notifications

When a PM reviews a phase:
- Notify the developer with the review outcome and comments
- If disapproved, emphasize that work is blocked until changes are made

---

## Files Modified

| File | Changes |
|------|---------|
| `src/components/dashboards/PMDashboard.tsx` | Add phase review section with 3 approval options, severity picker, comment dialog |
| `src/components/dashboards/DeveloperDashboard.tsx` | Add change timer display, blocking logic for disapproved phases, "Mark Changes Complete" button, update PhaseProgress component |
| `src/components/dashboards/AdminDashboard.tsx` | Mirror phase review visibility for admin oversight |

## Files Created

None -- all changes fit within existing components.

---

## Technical Details

### Phase Review Dialog (PM Side)

```text
+------------------------------------------+
|  Review Phase 1 - Homepage               |
|                                          |
|  [Approve]                               |
|  [Approve with Changes]                  |
|  [Disapprove with Changes]               |
|                                          |
|  -- If changes selected --               |
|  Severity: [Minor] [Average] [Major]     |
|            [Major Major (PM extends)]    |
|                                          |
|  Comment: [________________________]     |
|           [________________________]     |
|                                          |
|  [Submit Review]                         |
+------------------------------------------+
```

### Developer Card -- Change Timer Display

```text
Phase 2 in Progress
SLA: 7h 23m 15s remaining
Changes (Phase 1): 1h 45m remaining [Minor]
```

### Blocking Logic

When checking if a developer can advance phases:
1. Query all `project_phases` for the task
2. If any phase has `review_status = 'disapproved_with_changes'` and `change_completed_at IS NULL`, block progression
3. The "Move to Next Phase" and "Complete Website" buttons check this condition

