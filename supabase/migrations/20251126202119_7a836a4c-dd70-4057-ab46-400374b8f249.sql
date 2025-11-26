-- Add reference file columns for revision requests
ALTER TABLE design_submissions
ADD COLUMN revision_reference_file_path text,
ADD COLUMN revision_reference_file_name text;