-- Add foreign key constraint from tasks.project_manager_id to profiles.id
ALTER TABLE public.tasks
DROP CONSTRAINT IF EXISTS tasks_project_manager_id_fkey;

ALTER TABLE public.tasks
ADD CONSTRAINT tasks_project_manager_id_fkey
FOREIGN KEY (project_manager_id)
REFERENCES public.profiles(id)
ON DELETE CASCADE;