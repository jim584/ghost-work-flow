

## Fix: "Submit Phase 6" Button Showing After Revision Changes on Completed Website

### Problem
When a website is marked complete (all phases submitted), then a PM requests changes on a phase, and the developer completes those changes, the task status remains `in_progress`. Since the "Submit Phase 6" button only checks `task.status === "in_progress"` (line 2084), it incorrectly shows even though Phase 6 was already submitted.

### Root Cause
The condition `task.status === "in_progress"` is too broad. It doesn't account for whether the current phase has already been submitted (`completed_at` is set on the `project_phases` record).

### Proposed Fix

**1. Hide "Submit Phase" when current phase is already submitted**
In `DeveloperDashboard.tsx` (around line 2084), add a check: only show the "Submit Phase X" button if the current phase record does NOT have `completed_at` set. This means:
- Look up the current phase from `projectPhases` by matching `task_id` and `phase_number === task.current_phase`
- If that phase has `completed_at`, hide the button — the phase was already submitted, only revisions may be needed

**2. Auto-revert task status to `completed` after revision changes are done**
In `handleMarkPhaseComplete` (line 431), after marking changes as complete, check if the task was previously completed (i.e., the task's `total_phases` is set and equals `current_phase`, meaning the website was finished). If so, set `task.status` back to `completed` instead of leaving it as `in_progress`. This restores the correct workflow state.

### Files to modify
- `src/components/dashboards/DeveloperDashboard.tsx`
  - Line ~2084: Add phase completion check to the submit button condition
  - Line ~431 (`handleMarkPhaseComplete`): After marking changes complete, check if all phases are submitted and auto-revert task status to `completed` if applicable

