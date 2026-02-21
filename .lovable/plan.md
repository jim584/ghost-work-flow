

## ✅ Add "New Developer Reply" Indicator on PM Order Cards (COMPLETED)

### Changes Made

1. **Database**: Added `pm_read_at` column to `phase_review_replies` + UPDATE RLS policy for PMs
2. **PMDashboard.tsx**: Added query for unread replies, red pulsing badge on order cards, realtime subscription for `phase_review_replies`
3. **PhaseReviewReplySection.tsx**: Added `isPMViewer` prop, auto-marks replies as read on mount
4. **PhaseReviewSection.tsx**: Passes `isPMViewer={true}` to reply sections
