

# Launch Website Modal Flow

## Overview
Replace the current one-click "Launch Website" button with a modal that collects domain, access method, hosting provider details, and optional Plex hosting pricing before sending the website for launch and notifying the developer.

## What Will Happen

When a PM clicks "Launch Website" on a completed website order, a modal dialog will appear with the following sections:

**1. Domain Name** (required text input)

**2. Access Method** (dropdown with 3 options):
- "Client will provide login credentials"
- "Client will delegate access"  
- "Client will change nameservers"

**3. Conditional Credentials** (only shown when "Client will provide login credentials" is selected):
- Hosting Username (text input)
- Hosting Password (password input)

**4. Hosting Provider** (dropdown, defaults to "Plex Hosting"):
- Plex Hosting
- Client Hosting

**5. Conditional Plex Hosting Price** (only shown when "Plex Hosting" is selected):
- Total Amount, Amount Paid, Amount Pending (same 3-field layout as the order form)

On submit, the modal saves all launch details to the task, sets the status to `approved`, and sends a `website_launch` notification to the developer.

## Technical Details

### Database Migration

Add new columns to the `tasks` table for launch data:

```sql
ALTER TABLE tasks
  ADD COLUMN launch_domain TEXT,
  ADD COLUMN launch_access_method TEXT,
  ADD COLUMN launch_hosting_username TEXT,
  ADD COLUMN launch_hosting_password TEXT,
  ADD COLUMN launch_hosting_provider TEXT DEFAULT 'plex_hosting',
  ADD COLUMN launch_hosting_total NUMERIC DEFAULT 0,
  ADD COLUMN launch_hosting_paid NUMERIC DEFAULT 0,
  ADD COLUMN launch_hosting_pending NUMERIC DEFAULT 0;
```

### File: `src/components/dashboards/PMDashboard.tsx`

**1. Add state for the launch modal:**
- `launchDialog`: stores the task ID, title, and developer ID when the modal is open (null when closed)
- Form state for all launch fields with defaults

**2. Replace the direct `launchWebsite.mutate()` call on the button with opening the modal instead:**
```
onClick={() => setLaunchDialog({ taskId: task.id, taskTitle: task.title, developerId: task.developer_id })
```

**3. Update the `launchWebsite` mutation to include the new fields:**
- Save all launch fields to the task alongside setting `status: 'approved'`
- Keep the existing notification logic unchanged

**4. Add the Dialog component at the bottom of the JSX:**
- Modal with form fields as described above
- Conditional rendering for credentials fields (when access method = "Client will provide login credentials")
- Conditional rendering for Plex pricing fields (when hosting provider = "Plex Hosting")
- Domain name is required; form validates before submission
- "Launch Website" submit button with Rocket icon

### Validation Rules
- Domain name: required
- Access method: required
- Hosting provider: required (defaults to Plex Hosting)
- Plex hosting total/paid/pending: only required when Plex Hosting is selected
- Credentials: only shown when "Client will provide login credentials" is selected

### UI Layout
The modal will follow the existing dialog patterns in the codebase (using the `Dialog` component from `@/components/ui/dialog`). The pricing fields will use the same 3-column grid layout as the order creation form.
