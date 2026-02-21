-- Add dev_read_at column to phase_review_replies to track when developer has seen PM replies
ALTER TABLE phase_review_replies ADD COLUMN dev_read_at timestamptz DEFAULT NULL;