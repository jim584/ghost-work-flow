-- Add tracking fields for handoff and closure
ALTER TABLE public.tasks 
ADD COLUMN transferred_by uuid REFERENCES public.profiles(id),
ADD COLUMN closed_by uuid REFERENCES public.profiles(id);