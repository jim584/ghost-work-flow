

# Match Front Sales Card Design to PM Dashboard

## What Changes

The order cards in the Front Sales dashboard will be updated to match the PM dashboard's visual design. This means adding status-based color coding, category badges, attachment previews, and better team status indicators -- while keeping Front Sales-specific features (delete button, no approve/revision actions).

## Visual Changes

1. **Color-coded left borders** based on order status:
   - Green border for completed/delivered orders
   - Red border for delayed orders
   - Orange border for orders needing revision
   - Gray border for cancelled orders

2. **Category badges** next to the order title:
   - "Delivered" badge for completed tasks
   - "DELAYED -- X hours overdue" badge for past-deadline orders
   - "Needs Revision" badge when applicable

3. **Attachments section** showing uploaded files with download buttons (matching PM layout with preview thumbnails)

5. **Per-team status indicators** in the Assignment section for multi-team orders, showing each team's current status (Pending, Working, Delivered, Approved, Cancelled) with color-coded icons -- matching the PM dashboard format

6. **Payment display update** to match PM's inline format showing paid/pending amounts with color coding

## Technical Details

### File Modified
- `src/components/dashboards/FrontSalesDashboard.tsx`

### Key Changes
- Add a `getBorderClass()` helper function that returns left-border CSS classes based on task status (pending, in_progress, completed, approved, cancelled, delayed)
- Add `getCategoryBadge()` and `getDelayedBadge()` helpers for status badges in the card header
- Update the card wrapper div to use `getBorderClass()` alongside existing classes
- Replace the simple "View Details" button area with a proper card footer (`px-4 py-3 bg-muted/20 border-t`)
- Add attachments section before the footer (matching PM's attachment rendering with FilePreview + Download)
- Update the multi-team Collapsible section to show per-team status icons (Pending, Working, Delivered, Approved, Cancelled) instead of just a status badge
- Update payment section to match PM's inline format with green/orange coloring
- No new dependencies needed -- all icons and components are already imported
