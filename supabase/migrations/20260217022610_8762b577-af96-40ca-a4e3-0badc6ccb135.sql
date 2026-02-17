
ALTER TYPE task_status ADD VALUE 'on_hold';

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS hold_reason text;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS held_at timestamptz;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS held_by uuid;
