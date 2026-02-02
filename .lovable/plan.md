

## Overview

Make all performance metrics in the Admin Dashboard's Front Sales Performance section clickable. When clicked, each metric will open a dialog showing the relevant filtered data for that specific user.

## Clickable Metrics

The following metrics in each Front Sales user card will become clickable:

| Metric | Click Action |
|--------|--------------|
| Monthly Target | Opens a dialog to edit the target (already has Edit Target button - will make the number itself clickable too) |
| Total Achieved | Shows all orders (transferred + closed) attributed to this user |
| Transferred | Shows only orders where this user is the `transferred_by` |
| Closed | Shows only orders where this user is the `closed_by` |
| Closed Revenue | Shows closed orders with their revenue amounts |

## Implementation Details

### 1. Add State for Metric Details Dialog

Add new state variables to manage the metric details dialog:

```tsx
const [metricDetailsDialog, setMetricDetailsDialog] = useState<{
  open: boolean;
  userId: string;
  userName: string;
  metricType: 'target' | 'total_achieved' | 'transferred' | 'closed' | 'revenue';
} | null>(null);
```

### 2. Create Metric-Filtered Tasks Query

Add a query to fetch tasks filtered by the selected user and metric type:

- For **Transferred**: Tasks where `transferred_by === userId`
- For **Closed**: Tasks where `closed_by === userId`  
- For **Total Achieved**: Tasks where `transferred_by === userId` OR `closed_by === userId`
- For **Revenue**: Tasks where `closed_by === userId` (showing revenue details)

### 3. Make Metric Values Clickable

Update each metric display from static text to clickable buttons with hover effects:

```tsx
<div 
  className="space-y-1 cursor-pointer hover:bg-muted/50 rounded-lg p-2 -m-2 transition-colors"
  onClick={() => setMetricDetailsDialog({
    open: true,
    userId: salesUser.id,
    userName: salesUser.full_name || salesUser.email,
    metricType: 'transferred',
  })}
>
  <p className="text-sm text-muted-foreground">Transferred</p>
  <p className="text-2xl font-bold text-orange-500">{transferredCount}</p>
</div>
```

### 4. Create Metric Details Dialog

Add a new dialog that displays filtered tasks based on the selected metric:

```text
+--------------------------------------------------+
| [User Name] - [Metric Name]                      |
+--------------------------------------------------+
| Task List (Scrollable):                          |
|                                                  |
| #1234 - Website Design - ABC Company             |
|   Status: Pending | Revenue: $5,000              |
|   [View Details]                                 |
|                                                  |
| #1235 - Logo Design - XYZ Corp                   |
|   Status: Completed | Revenue: $1,500            |
|   [View Details]                                 |
|                                                  |
| ... more tasks ...                               |
+--------------------------------------------------+
```

### 5. Monthly Target Click Behavior

The Monthly Target metric will trigger the existing Edit Target dialog when clicked (same as the "Edit Target" button).

## Technical Details

### File to Modify
- `src/components/dashboards/AdminDashboard.tsx`

### New State Variables
```tsx
const [metricDetailsDialog, setMetricDetailsDialog] = useState<{
  open: boolean;
  userId: string;
  userName: string;
  metricType: 'target' | 'total_achieved' | 'transferred' | 'closed' | 'revenue';
} | null>(null);
```

### Task Filtering Logic
```tsx
const getFilteredTasksForMetric = (userId: string, metricType: string) => {
  if (!tasks) return [];
  
  switch (metricType) {
    case 'transferred':
      return tasks.filter(t => t.transferred_by === userId && !t.is_upsell);
    case 'closed':
      return tasks.filter(t => t.closed_by === userId && !t.is_upsell);
    case 'total_achieved':
      return tasks.filter(t => 
        (t.transferred_by === userId || t.closed_by === userId) && !t.is_upsell
      );
    case 'revenue':
      return tasks.filter(t => t.closed_by === userId && !t.is_upsell);
    default:
      return [];
  }
};
```

### Dialog Content Structure
The dialog will include:
- Header with user name and metric type
- ScrollArea with list of filtered tasks
- Each task shows: task number, title, status badge, revenue (if applicable)
- "View Details" button that opens the existing view details dialog

### Visual Feedback
- Hover state: `hover:bg-muted/50` with `transition-colors`
- Cursor: `cursor-pointer`
- Slight padding adjustment for better click target

