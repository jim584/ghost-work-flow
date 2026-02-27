

## Plan: "Live, Upsell Awaiting" Tab in PM Dashboard

The "Verify & Close Order" button already exists on task cards (appears when `launch_website_live_at` is set, hidden after `upsell_verified_at` is set). No changes needed there.

### Changes to `PMDashboard.tsx`

**1. New category `website_live` in single-task categorization (~line 1585)**
- Tasks with `launch_website_live_at` set AND `upsell_verified_at` not set → `website_live`
- Currently these fall into `pending_delivery`; split them into their own category

**2. New category `website_live` in multi-team categorization (`getGroupCategories`)**
- Same detection logic for grouped orders

**3. Add stat count for `website_live`**
- Count grouped orders with the `website_live` category for the badge

**4. Add "Live, Upsell Awaiting" tab button (after the Awaiting Launch button)**
- Green rocket icon, badge with count, filters by `website_live`

**5. Add `website_live` to priority category order (after `awaiting_launch`)**
- Ensures cards render in the priority view

### Complete workflow after changes
```text
All phases approved → "Awaiting Launch" tab (status: completed)
PM clicks Launch Website → Priority Dashboard / pending_delivery (status: approved, launch_domain set)
Developer marks live → "Live, Upsell Awaiting" tab (launch_website_live_at set)
PM clicks Verify & Close → exits priority views (upsell_verified_at set)
```

No database changes needed. No new components needed.

