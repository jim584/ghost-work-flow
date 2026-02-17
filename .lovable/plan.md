

# Add Order-Level "Put on Hold" for Website Orders

## What Changes

Add a "Put on Hold" button at the **order/card level** in the PM Dashboard, alongside the existing "Cancel Order" button. This lets a PM freeze the entire order (not just one phase) when the customer is unavailable, traveling, or hasn't provided required information.

## How It Works

- **Put on Hold**: Sets the task status to a new `on_hold` value in the `task_status` enum. Requires a mandatory reason. All active phases effectively pause since the order itself is on hold.
- **Resume**: A "Resume" button replaces "Put on Hold" when the order is on hold, setting the status back to `in_progress`.
- **Visual indicator**: When on hold, the order card shows an "On Hold" badge with the hold reason displayed.

## Availability Rules

- The "Put on Hold" button appears when the order is `pending` or `in_progress` (same conditions as "Cancel Order", minus the phase-submission restriction -- PMs should be able to hold an order at any stage).
- The "Resume" button appears only when the order is `on_hold`.
- Both are restricted to the assigned PM.

## Technical Details

### 1. Database Migration

Add `on_hold` to the `task_status` enum:

```sql
ALTER TYPE task_status ADD VALUE 'on_hold';
```

The `tasks` table already has `hold_reason` (text), `held_at` (timestamptz), and `held_by` (uuid) columns from a prior migration -- we will reuse these for order-level holds. (If they don't exist on `tasks`, we'll add them.)

**Wait -- those columns were added to `project_phases`, not `tasks`.** So we need to add them to the `tasks` table as well:

```sql
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS hold_reason text;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS held_at timestamptz;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS held_by uuid;
```

### 2. File: `src/components/dashboards/PMDashboard.tsx`

**A. Add hold/resume dialog state** (similar to `cancelDialog`):
```typescript
const [holdOrderDialog, setHoldOrderDialog] = useState<{
  open: boolean; taskId: string; 
}>({ open: false, taskId: "" });
const [holdOrderReason, setHoldOrderReason] = useState("");
```

**B. Add hold/resume mutations:**
- **Hold**: Update task status to `on_hold`, set `hold_reason`, `held_at`, `held_by`
- **Resume**: Update task status back to `in_progress`, clear hold fields

**C. Add buttons in 3 locations** (matching the cancel button pattern):

1. Card header (single-team, line ~1500 area) -- add a hold icon button
2. Multi-team status list (line ~1647 area) -- add hold icon per team task
3. Expanded card view (line ~1803 area) -- add "Put on Hold" / "Resume" text button next to "Cancel Order"

**D. Add "On Hold" badge** on the card when `task.status === 'on_hold'`, displaying the hold reason.

**E. Add hold reason dialog** -- a simple AlertDialog with a textarea for the reason (mirrors the cancel dialog pattern).

### 3. Developer/Designer Dashboard Visibility

When the order status is `on_hold`, the existing status badge rendering will show "on hold" to developers/designers. No additional changes needed in those dashboards since they read `task.status` directly.

### 4. Phase-Level vs Order-Level Hold

- **Phase-level hold** (existing): Pauses one specific phase via `project_phases.status = 'on_hold'`. Managed in `PhaseReviewSection.tsx`.
- **Order-level hold** (new): Pauses the entire order via `tasks.status = 'on_hold'`. Managed in `PMDashboard.tsx`. When the order is on hold, the phase-level UI should reflect that the order is frozen (the phase buttons will naturally be unavailable since the order isn't "in_progress").
