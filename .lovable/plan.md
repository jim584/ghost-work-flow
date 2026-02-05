
# Add Zip File Upload Support for Designers

## Overview
Enable designers to upload zip files when submitting their work, allowing them to bundle multiple design assets into a single compressed archive.

## Changes Required

### File: `src/components/dashboards/DesignerDashboard.tsx`

**Location**: Line 766

**Current code**:
```tsx
accept="image/*,.pdf,.ai,.psd,.fig,.sketch"
```

**Updated code**:
```tsx
accept="image/*,.pdf,.ai,.psd,.fig,.sketch,.zip"
```

## Technical Details
- The `accept` attribute on the file input element controls which file types the browser's file picker will allow
- Adding `.zip` to the comma-separated list will enable designers to select zip archives
- No changes needed to the upload logic since Supabase Storage already handles binary files of any type
- The existing `design-files` bucket will store zip files the same way it stores other file types

## Impact
- Designers can now upload compressed archives containing multiple files
- Useful for submitting complete design packages with fonts, images, and source files bundled together
- No backend changes required
