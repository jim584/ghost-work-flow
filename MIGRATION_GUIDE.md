# Migration Guide — Lovable Cloud → Self-Managed Supabase

## Overview
This document contains everything needed to migrate from the current Lovable Cloud backend to your own Supabase project.

## Migration Steps

### Step 1: Run the Schema Migration SQL
Copy the contents of `migration_full.sql` and run it in your new project's Supabase SQL Editor.

### Step 2: Copy Edge Functions
Copy these folders to the new project:
- `supabase/functions/calculate-sla-deadline/`
- `supabase/functions/check-delayed-tasks/`
- `supabase/functions/check-late-acknowledgements/`
- `supabase/functions/reset-monthly-targets/`
- `supabase/functions/reset-user-password/`
- `supabase/functions/send-task-notification/` (if exists)

### Step 3: Configure `supabase/config.toml`
Ensure all edge functions have `verify_jwt = false` as in the current config.

### Step 4: Set Up Secrets
The following secrets need to be configured in your new Supabase project:
- `RESEND_API_KEY` — For email notifications

### Step 5: Create Storage Bucket
The `design-files` bucket (private) needs to be created. This is included in the migration SQL.

### Step 6: Set Up Auth Trigger
The `handle_new_user` function creates profile entries. The trigger on `auth.users` must be created via the Supabase dashboard since we can't modify the auth schema via migrations.

Run this in the SQL Editor:
```sql
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

### Step 7: Realtime
Enable realtime for these tables (included in migration SQL):
- tasks, design_submissions, notifications, project_phases
- order_messages, order_message_reads, message_reactions
- phase_reviews, phase_review_replies, task_hold_events

### Step 8: Data Migration
Export data from the current Lovable Cloud instance and import into the new Supabase project. Use the Cloud View → Database → Export feature for each table.
