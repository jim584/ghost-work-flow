-- Add attachment fields for task creation
ALTER TABLE tasks
ADD COLUMN attachment_file_path text,
ADD COLUMN attachment_file_name text;