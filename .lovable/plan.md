

# Fix Change Badge Logic for PM Dashboard

## Problem 1: "Changes Submitted" badge keeps pulsing even after PM has seen it
The pulsing "Changes Submitted (P1)" badge on the PM card face continues to pulse indefinitely. It should stop pulsing (or disappear) once the PM expands the card and sees the changes.

## Problem 2: Badge shows stale round info when a newer round exists
When a PM sends a second round of changes (round 2) after the developer completed round 1, the card face still shows "Changes Submitted" for that phase because `project_phases.change_completed_at` is set from round 1. The badge should reflect the **latest round's** status, not an older completed round.

## Solution

### Approach for Problem 2 (Latest round logic)
Fetch `phase_reviews` data alongside `project_phases` in the PM dashboard. For each phase, check the **latest round** in `phase_reviews` to determine badge status rather than relying solely on `project_phases.change_completed_at`.

- If the latest `phase_reviews` round has `change_completed_at` set -- show "Changes Submitted"
- If the latest round has no `change_completed_at` -- show "Changes In Progress"
- If the phase has no pending change review status at all -- show nothing

### Approach for Problem 1 (Read acknowledgment)
When the PM expands the card (accordion opens), mark the latest submitted changes as "seen" by updating a timestamp. We will use the existing `phase_reviews.pm_read_at` field concept -- but since there is no such field currently, we have two options:

**Option A (Recommended - No DB change):** Remove the `animate-pulse` from "Changes Submitted" badge and instead make it a static badge. This is simpler and still communicates the status clearly. The badge disappears naturally once the PM re-reviews (approves or sends another round of changes), which resets the phase status.

**Option B (DB change):** Add a `pm_changes_read_at` column to `phase_reviews` to track when the PM viewed the submitted changes. Update it when the accordion expands.

I recommend Option A for simplicity, combined with fixing the round-based logic.

## Technical Details

### Change 1: Fetch phase_reviews in PMDashboard.tsx
Add a new query to fetch `phase_reviews` for website tasks, similar to the existing `projectPhases` query:

```typescript
const { data: phaseReviews } = useQuery({
  queryKey: ["pm-phase-reviews", taskIds],
  queryFn: async () => {
    const websiteTaskIds = tasks?.filter(t => t.post_type === "Website Design").map(t => t.id) || [];
    if (!websiteTaskIds.length) return [];
    const { data, error } = await supabase
      .from("phase_reviews")
      .select("*")
      .in("task_id", websiteTaskIds)
      .order("round_number", { ascending: false });
    if (error) throw error;
    return data;
  },
  enabled: !!taskIds.length,
});
```

### Change 2: Update card-face badge logic (~lines 1959-1992)
Replace the current logic that checks `project_phases.change_completed_at` with logic that checks the **latest round** in `phase_reviews` for each phase:

For "Changes Submitted" badge:
- Find phases with `review_status` of `approved_with_changes` or `disapproved_with_changes`
- For each such phase, find the latest `phase_reviews` round
- Only show "Changes Submitted" if the latest round's `change_completed_at` is set
- Remove `animate-pulse` to make it a static badge (stops pulsing)

For "Changes In Progress" badge:
- Same phase filter, but show when the latest round's `change_completed_at` is NOT set

### Change 3: Apply same logic to DeveloperDashboard.tsx
Update the "Changes Needed" badge on the developer side to also check the latest `phase_reviews` round, ensuring consistency. If the latest round already has `change_completed_at`, the developer shouldn't see "Changes Needed" for that round.

### Summary of behavior after fix
- **PM card face**: Shows "Changes Submitted (P1)" only when the LATEST review round for that phase has completed changes. No pulsing animation. Badge disappears once PM re-reviews.
- **PM card face**: Shows "Changes In Progress (P1)" only when the LATEST review round has pending changes.
- **Dev card face**: Shows "Changes Needed (P1)" only when the LATEST review round has no completion timestamp.
- Multiple rounds are handled correctly -- old round completions don't create false "submitted" badges.
