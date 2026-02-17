ALTER TABLE tasks
  ADD COLUMN launch_domain TEXT,
  ADD COLUMN launch_access_method TEXT,
  ADD COLUMN launch_hosting_username TEXT,
  ADD COLUMN launch_hosting_password TEXT,
  ADD COLUMN launch_hosting_provider TEXT DEFAULT 'plex_hosting',
  ADD COLUMN launch_hosting_total NUMERIC DEFAULT 0,
  ADD COLUMN launch_hosting_paid NUMERIC DEFAULT 0,
  ADD COLUMN launch_hosting_pending NUMERIC DEFAULT 0;