

## Add "Notes Read" Event to Timeline

When the developer clicks "Mark as Read", record this as a visible event in the timeline so PMs and admins can see when the developer acknowledged the PM notes.

### Approach

No new database table needed. The `dev_read_at` timestamp already exists on `phase_reviews`. The timeline rendering in `DevPhaseReviewTimeline.tsx` just needs to include these as events.

### Implementation Steps

**File: `src/components/dashboards/DevPhaseReviewTimeline.tsx`**

1. In the **chronological view** (`renderChronologicalView`): Add timeline items for `pm_note` reviews that have a `dev_read_at` value. Render them with a distinct icon (e.g., `Eye` or `CheckCircle2`) showing "Developer read PM notes for Phase X" with the `dev_read_at` timestamp.

2. In the **grouped view** (`renderGroupedView`): Add a "Notes Read" section (or append to milestones) showing entries where `review_status === "pm_note" && dev_read_at` — displaying which phase's notes were read and when.

### Summary
- ~20-30 lines added to `DevPhaseReviewTimeline.tsx`
- No database changes needed — uses existing `dev_read_at` field
- Shows up in both Grouped and Chronological timeline views

