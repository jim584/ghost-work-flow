

# Add "Client will update DNS records" to Access Method Dropdown

## Overview
Add a new "Client will update DNS records" option to the Access Method dropdown in the Launch Website modal. This covers scenarios where the client needs to manually add A, CNAME, or MX records to point their domain to the server, as opposed to changing nameservers entirely.

## What Changes

The Access Method dropdown will now have 5 options (in order):
1. Client will provide domain login credentials
2. Client will delegate access
3. Client will change nameservers
4. **Client will update DNS records** (new)
5. Not required

## Technical Details

### File: `src/components/dashboards/PMDashboard.tsx`

Add a new `SelectItem` with value `"dns_records"` between the "nameservers" and "not_required" options (around line 3220-3221):

```tsx
<SelectItem value="credentials">Client will provide domain login credentials</SelectItem>
<SelectItem value="delegate">Client will delegate access</SelectItem>
<SelectItem value="nameservers">Client will change nameservers</SelectItem>
<SelectItem value="dns_records">Client will update DNS records</SelectItem>
<SelectItem value="not_required">Not required</SelectItem>
```

No database changes are needed -- the `launch_access_method` column is already a TEXT field and will store the new value without any schema modification.

