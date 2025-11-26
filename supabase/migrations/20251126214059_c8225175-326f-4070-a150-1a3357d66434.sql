-- Add foreign key constraint from design_submissions.designer_id to profiles.id
ALTER TABLE public.design_submissions
DROP CONSTRAINT IF EXISTS design_submissions_designer_id_fkey;

ALTER TABLE public.design_submissions
ADD CONSTRAINT design_submissions_designer_id_fkey
FOREIGN KEY (designer_id)
REFERENCES public.profiles(id)
ON DELETE CASCADE;