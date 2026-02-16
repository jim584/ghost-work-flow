

# Display PM Review Feedback in Phase Review Section

## Problem
After a PM submits a phase review with comments, voice notes, or file attachments, they cannot see or review what they submitted. The Phase Reviews section only shows a tiny truncated comment snippet. Voice notes and files are completely invisible to the PM.

The Developer Dashboard already displays all of this (comment, voice playback, file downloads), but the PM's own view in `PhaseReviewSection.tsx` does not.

## Solution
Add a collapsible "PM Review" block under each reviewed phase that shows:
- Full text comment
- Reviewed timestamp and severity badge
- Voice note with a play button (downloads and plays via signed URL)
- Attached files with preview thumbnails and download buttons
- Styled consistently with the existing PM Review blocks used elsewhere in the app (orange-themed for "with changes")

## What Changes

### PhaseReviewSection.tsx
After the review status badge row (line ~290), add a detailed review block for phases that have been reviewed. This block will:

1. **Full Comment Display** -- Show the complete `review_comment` text (not truncated)
2. **Timestamp** -- Show `reviewed_at` formatted as a readable date
3. **Severity Badge** -- Show the change severity level
4. **Voice Note Playback** -- If `review_voice_path` exists, render a play button that creates a signed URL and plays the audio
5. **File Attachments** -- If `review_file_paths` exists, parse the delimiter-separated paths/names and render:
   - Image thumbnails (using the existing `FilePreview` component) for image files
   - File icon + name for non-image files
   - Download button for each file (via signed URL)
6. **Collapsible** -- Use a Collapsible component so it doesn't overwhelm the compact phase list; default open for phases with active change requests

### No New Files Needed
All changes are within `PhaseReviewSection.tsx`, reusing existing components:
- `FilePreview` for image thumbnails
- `Collapsible` / `CollapsibleTrigger` / `CollapsibleContent` from the UI library
- `supabase.storage.from("design-files").createSignedUrl()` for secure access
- `format()` from date-fns for timestamps

### Technical Details

**Replace the truncated comment display (lines 285-290) with an expandable review details block:**

```
{hasReview && (review_comment || review_voice_path || review_file_paths)} -->
  Collapsible block:
    - Header: "PM Review" + reviewed_at timestamp + severity badge
    - Content:
      - Full comment text
      - Voice note: Play/Download button
      - Files: FilePreview thumbnails + download links
```

**Voice playback pattern** (same as DeveloperDashboard):
- Download blob via `supabase.storage.from("design-files").download(path)`
- Create object URL and play with `new Audio(url)`

**File download pattern**:
- Create signed URL via `supabase.storage.from("design-files").createSignedUrl(path, 3600)`
- Open in new tab for download

**Imports to add**:
- `Collapsible, CollapsibleTrigger, CollapsibleContent` from UI
- `FilePreview` component
- `Download, Play, ChevronDown` icons from lucide-react

