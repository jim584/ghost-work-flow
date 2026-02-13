

# Developer Upload: URL as Primary Requirement

## Summary

Change the developer upload dialog so the Website URL field is **required** (primary action), while comments and file uploads remain optional. The designer upload dialog stays unchanged (files required).

## Changes

### File: `src/components/dashboards/DeveloperDashboard.tsx`

1. **URL label**: Change "Website Homepage URL (optional)" to "Website Homepage URL (required)" and add a required visual indicator (asterisk).

2. **Instruction text**: Update the helper text from "Upload your deliverables..." to "Enter the website URL you are working on. You can also add comments or upload files if needed."

3. **Submit button validation**: Change the disabled condition so the button requires `homepageUrl` to be filled:
   - Current: `(!files.length && !homepageUrl.trim() && !developerComment.trim())`
   - New: `!homepageUrl.trim()`

4. **handleFileUpload validation**: Update the early return guard to require URL:
   - Current: `if (!selectedTask || (!files.length && !homepageUrl.trim() && !developerComment.trim())) return;`
   - New: `if (!selectedTask || !homepageUrl.trim()) return;`

5. **Field labels**: Update "Comment (optional)" and "Files (multiple allowed)" to "Comment (optional)" and "Files (optional)" to clarify that only the URL is required.

6. **Field order**: Keep the current order (URL first, then Comment, then Files) since it already prioritizes the URL.

7. **Submit button text**: Change to always show "Submit" since file upload is no longer the primary action.

### No changes to `DesignerDashboard.tsx`

The designer upload flow already requires files and will remain unchanged.

### No database changes needed

The existing schema already supports URL-only submissions via the "no-file" and "comment-only" placeholders.
