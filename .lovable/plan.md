

# Move Business Description from Card Face to View Details

## What Changes
Remove the business description text from the main developer dashboard card and keep it only inside the "View Details" dialog where it already exists.

## Why
The main card should be a quick-glance summary showing only essential info: order number, title, badges, phase progress, and timers. The full description adds visual clutter and makes cards unnecessarily tall, especially when multiple orders are listed.

## Technical Details

**File: `src/components/dashboards/DeveloperDashboard.tsx`**

**Line 1466** -- Remove:
```
<p className="text-sm text-muted-foreground">{task.description}</p>
```

This single line removal cleans up the card face. The description remains accessible inside the "View Details" dialog (already present at lines 2570-2576 as "Business Description").

