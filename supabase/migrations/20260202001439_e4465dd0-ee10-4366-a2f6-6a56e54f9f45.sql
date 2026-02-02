-- Add front_sales to the app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'front_sales';