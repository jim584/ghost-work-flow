
# Add Additional File Upload Option for Designers

## Overview
Enable designers to upload additional files to any order at any time, even after initial delivery or revision uploads. This provides flexibility when designers need to add supplementary files, corrections, or additional design variations.

## Current Behavior
- Upload button only appears when task status is "in_progress"
- Upload Revision button only appears when a revision is requested
- Once task is completed/approved, no upload option is available

## Proposed Changes

### File: `src/components/dashboards/DesignerDashboard.tsx`

#### 1. Add "Add More Files" Button for Completed/Approved Tasks

**Location**: Lines 574-615 (task action buttons area)

Add a new button that appears for tasks that:
- Have at least one submission already uploaded
- Are in "completed" or "approved" status (not pending or in_progress)
- Do not currently need revision

```tsx
{/* Add Files button for completed tasks */}
{taskSubmissions.length > 0 && 
 (task.status === "completed" || task.status === "approved") && 
 !hasRevision && (
  <Button 
    size="sm" 
    variant="outline"
    onClick={() => setSelectedTask(task)}
  >
    <Upload className="mr-2 h-4 w-4" />
    Add Files
  </Button>
)}
```

#### 2. Modify Upload Logic to Not Change Status When Adding Files

**Location**: Lines 135-222 (handleFileUpload function)

Update the upload function to:
- Detect when adding files to an already completed/approved task
- Skip the status update in that case
- Show appropriate success message

The key change is around lines 193-201:
```tsx
// Only update task status if:
// 1. Not a revision upload AND
// 2. Task is not already completed/approved
if (!hasRevision && selectedTask.status !== "completed" && selectedTask.status !== "approved") {
  const { error: statusError } = await supabase
    .from("tasks")
    .update({ status: "completed" })
    .eq("id", selectedTask.id);

  if (statusError) throw statusError;
}
```

#### 3. Update Success Toast Message

Modify the toast message to reflect the action taken:
```tsx
const isAddingMoreFiles = selectedTask.status === "completed" || selectedTask.status === "approved";
toast({ 
  title: hasRevision 
    ? "Revision uploaded successfully" 
    : isAddingMoreFiles 
      ? "Additional files uploaded successfully"
      : "All designs uploaded successfully",
  description: `${files.length} file(s) submitted`
});
```

## User Experience
- Tasks with existing uploads will show an "Add Files" button in the actions area
- Clicking opens the same upload dialog used for initial uploads
- Files are added as new submissions without changing the task status
- Designer can add comments to the new files
- PM will see all submissions in their dashboard

## Technical Details
- No database schema changes required
- Reuses existing upload dialog and file handling logic
- New submissions are created with the same structure as initial submissions
- The `revision_status` will default to "pending_review" for new uploads

## Summary of Changes
| Location | Change |
|----------|--------|
| Lines 574-615 | Add "Add Files" button for completed/approved tasks |
| Lines 193-201 | Modify status update logic to skip for completed/approved tasks |
| Lines 205-208 | Update success toast message based on action type |
