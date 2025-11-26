-- Create RLS policies for design-files storage bucket
CREATE POLICY "Designers can upload their own design files"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'design-files' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Designers can view their own design files"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'design-files' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Admins and PMs can view all design files"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'design-files' 
  AND (
    has_role(auth.uid(), 'admin'::app_role) 
    OR has_role(auth.uid(), 'project_manager'::app_role)
  )
);