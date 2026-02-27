

## Plan: Add "Awaiting Launch" Tab & Update Badge

### File: `src/components/dashboards/PMDashboard.tsx`

**1. Add `awaiting_launch` category in `getPriorityCategory` (~line 1549)**
- Before the generic fallback, check: `isWebsite && status === 'approved' && !launch_website_live_at` → return `'awaiting_launch'`
- This category is **excluded** from Priority View (not added to the priority categories array)

**2. Same logic in `getGroupCategories` (~line 1484)**
- Add matching `awaiting_launch` detection for group-level categorization

**3. Add "Awaiting Launch" button to top nav (~line 1741)**
- New button between existing filters with a Rocket icon
- Filters to show only `awaiting_launch` orders
- Shows count badge of pending launches

**4. Update badge for approved websites (~line 2209)**
- When `isWebsite && task.status === 'approved' && !task.launch_website_live_at` → show "Website Completed" badge (green/blue styling, distinct from "Awaiting Final Review")

**5. Add `awaiting_launch` to `getCategoryPriority` (~line 1560)**
- Assign a sort priority for when these appear in filtered views

### What stays the same
- Priority View categories remain unchanged — no `awaiting_launch` in priority view
- All Tasks continues to show everything including awaiting launch orders
- Launch Website button functionality unchanged

