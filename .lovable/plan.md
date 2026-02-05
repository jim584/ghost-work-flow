# Consolidate Multi-Team Orders into Single Cards

## Status: ✅ IMPLEMENTED

## Summary
Multi-team logo orders are now consolidated into single cards in the PM dashboard.

## Changes Made

### Database
- Added `order_group_id` (UUID, nullable) column to `tasks` table
- Added index for efficient grouping queries

### CreateLogoOrderForm.tsx
- Generates `order_group_id` when multiple teams are selected
- All tasks for the same order share the same group ID

### PMDashboard.tsx
- Tasks are now grouped by `order_group_id`
- Single card displayed per order (not per team)
- Assignment section shows "X teams assigned" for multi-team orders
- Expandable submissions section organized by team with accordion
- Stats count unique orders instead of individual tasks

## UI Features
- Multi-team orders show a "X Teams" badge
- Expanded view shows accordion with team-specific submissions
- Each team section shows its uploaded files with status badges
- Download/Approve/Request Revision actions per file
