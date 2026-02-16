

# Enhanced Phase Review Submission System

## Overview
Transform the Phase Review dialog in the PM Dashboard from a simple text comment box into a full-featured submission panel matching the order-specific chat system's capabilities. This includes voice recording, file attachments, drag-and-drop, and mandatory input validation for "Approve with Changes" and "Disapprove with Changes" actions.

## Current Behavior
- Simple `Textarea` for review comments
- Comment mandatory only for "Disapprove with Changes"
- No voice recording, no file attachments, no emoji support
- Severity selection exists and connects to SLA timer

## What Changes

### 1. Mandatory Input Enforcement
- **Approve**: No comment required (unchanged)
- **Approve with Changes**: Comment OR voice message OR file attachment required
- **Disapprove with Changes**: Comment OR voice message OR file attachment required

The Submit button stays disabled until at least one form of input (text, voice, or file) is provided for the two "with changes" actions.

### 2. Enhanced Review Dialog UI
The review dialog will be rebuilt with a larger, richer submission panel containing:

**A. Text Input with Emoji Support**
- Multi-line text area (same styling as chat input)
- Emoji picker popover using the same 15-emoji set from OrderChat

**B. Voice Recording**
- Record button with live waveform visualization during recording
- Preview recorded audio before submitting (play/pause, duration display)
- Cancel or re-record option
- Voice note alone satisfies the mandatory requirement

**C. File Attachments**
- Paperclip button to attach files (any type: AI, PSD, ZIP, JPEG, PNG, PDF, DOC, XLSX, etc.)
- Drag-and-drop zone on the dialog
- File preview thumbnails (images inline, file icons for others)
- Multiple file support
- Remove individual files before submission

### 3. Storage and Data Flow
- Voice recordings uploaded to `design-files` bucket at `phase-reviews/{task_id}/{timestamp}.{ext}`
- Attached files uploaded to `design-files` bucket at `phase-reviews/{task_id}/{timestamp}_{filename}`
- Store file paths in `review_comment` field using a structured format, or add new columns to `project_phases` table:
  - `review_voice_path` (text, nullable) -- voice recording file path
  - `review_file_paths` (text, nullable) -- delimiter-separated file paths
  - `review_file_names` (text, nullable) -- delimiter-separated file names

### 4. Developer Dashboard Impact
When a review with changes is submitted:
- SLA change timer starts (already implemented via severity)
- Notification sent to developer (already implemented)
- Developer can see the review comment, voice note, and attached files in their dashboard's phase review block

### 5. Component Architecture
Create a new reusable component: `PhaseReviewSubmissionPanel.tsx`
- Extracts voice recording logic (same pattern as OrderChat: MediaRecorder API, waveform via AnalyserNode, preview playback)
- Extracts file attachment logic (click-to-browse + drag-and-drop)
- Emoji picker
- Validation logic (at least one input present)

The PhaseReviewSection dialog will use this new panel instead of the plain Textarea.

---

## Technical Details

### Database Migration
```sql
ALTER TABLE project_phases
  ADD COLUMN review_voice_path text,
  ADD COLUMN review_file_paths text,
  ADD COLUMN review_file_names text;
```

### Files to Create
- `src/components/PhaseReviewSubmissionPanel.tsx` -- Reusable panel with text + voice + file + emoji

### Files to Modify
- `src/components/dashboards/PhaseReviewSection.tsx` -- Replace Textarea with new panel, update validation, handle file/voice uploads, pass data to mutation
- `src/components/dashboards/DeveloperDashboard.tsx` -- Display review voice notes and attached files in the phase review block (if applicable)
- `src/components/dashboards/PMDashboard.tsx` -- Display review attachments in the PM's own phase review history view

### Upload Flow
1. PM selects severity, types comment / records voice / attaches files
2. On submit: upload voice + files to storage in parallel
3. Update `project_phases` row with review data (comment, voice path, file paths)
4. Calculate SLA deadline (existing logic)
5. Send notification to developer (existing logic, enhanced message to mention attachments)

### Validation Rules
```
canSubmit = (
  reviewType === "approved_with_changes" || reviewType === "disapproved_with_changes"
)
  ? (hasText || hasVoice || hasFiles)
  : true
```

### Voice Recording Pattern
Reuses the exact same MediaRecorder + AnalyserNode + waveform bar visualization pattern from OrderChat.tsx, including:
- `startRecording()` with `getUserMedia`
- Live waveform bars during recording
- `stopRecording()` producing a preview blob
- `togglePreviewPlayback()` for listen-before-send
- `cancelRecording()` cleanup

