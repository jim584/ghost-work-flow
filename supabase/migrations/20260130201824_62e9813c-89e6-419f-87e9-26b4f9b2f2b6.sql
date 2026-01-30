-- Create a function to validate safe filenames in public schema
CREATE OR REPLACE FUNCTION public.validate_safe_filename(filename text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Reject if filename contains path traversal sequences
  IF filename LIKE '%..%' OR filename LIKE '%/%' OR filename LIKE '%\%' THEN
    RETURN FALSE;
  END IF;
  
  -- Reject if filename starts with a dot (hidden files)
  IF filename LIKE '.%' THEN
    RETURN FALSE;
  END IF;
  
  -- Reject if filename contains null bytes or control characters
  IF filename ~ '[\x00-\x1f]' THEN
    RETURN FALSE;
  END IF;
  
  -- Accept only alphanumeric, dots, underscores, hyphens
  -- This mirrors the client-side sanitization pattern: [^a-zA-Z0-9._-]
  IF filename ~ '^[a-zA-Z0-9._-]+$' THEN
    RETURN TRUE;
  END IF;
  
  RETURN FALSE;
END;
$$;

-- Drop existing storage policies for design-files bucket
DROP POLICY IF EXISTS "Allow authenticated users to upload files" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated users to view files" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated users to update files" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated users to delete files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload design files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view design files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update own files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete own files" ON storage.objects;
DROP POLICY IF EXISTS "design_files_insert_policy" ON storage.objects;
DROP POLICY IF EXISTS "design_files_select_policy" ON storage.objects;
DROP POLICY IF EXISTS "design_files_update_policy" ON storage.objects;
DROP POLICY IF EXISTS "design_files_delete_policy" ON storage.objects;

-- Create new storage policies with filename validation for design-files bucket

-- SELECT: Users can view files in design-files bucket
CREATE POLICY "design_files_select_policy" ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id = 'design-files');

-- INSERT: Users can upload to their own folder with safe filenames
CREATE POLICY "design_files_insert_policy" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'design-files' 
  AND auth.uid()::text = (storage.foldername(name))[1]
  AND public.validate_safe_filename((storage.filename(name)))
);

-- UPDATE: Users can update files in their own folder with safe filenames
CREATE POLICY "design_files_update_policy" ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'design-files' 
  AND auth.uid()::text = (storage.foldername(name))[1]
)
WITH CHECK (
  bucket_id = 'design-files' 
  AND auth.uid()::text = (storage.foldername(name))[1]
  AND public.validate_safe_filename((storage.filename(name)))
);

-- DELETE: Users can delete files in their own folder
CREATE POLICY "design_files_delete_policy" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'design-files' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);