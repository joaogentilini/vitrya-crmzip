-- Migration: Fix recursive triggers causing "stack depth limit exceeded"
-- Date: 2025-01-16
-- Problem: Triggers that set updated_at on UPDATE cause infinite recursion
-- Solution: Add WHEN condition to prevent trigger re-firing when nothing changed

-- Drop and recreate the updated_at trigger function with recursion prevention
CREATE OR REPLACE FUNCTION public.trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  -- Only update if the row actually changed (prevents recursion)
  IF OLD IS DISTINCT FROM NEW THEN
    NEW.updated_at = NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Alternative: If you want a simpler approach, recreate triggers with WHEN clause
-- This prevents the trigger from firing when updated_at is the only change

-- For lead_types
DROP TRIGGER IF EXISTS set_updated_at_lead_types ON public.lead_types;
CREATE TRIGGER set_updated_at_lead_types
  BEFORE UPDATE ON public.lead_types
  FOR EACH ROW
  WHEN (OLD.* IS DISTINCT FROM NEW.*)
  EXECUTE FUNCTION public.trigger_set_updated_at();

-- For lead_interests
DROP TRIGGER IF EXISTS set_updated_at_lead_interests ON public.lead_interests;
CREATE TRIGGER set_updated_at_lead_interests
  BEFORE UPDATE ON public.lead_interests
  FOR EACH ROW
  WHEN (OLD.* IS DISTINCT FROM NEW.*)
  EXECUTE FUNCTION public.trigger_set_updated_at();

-- For lead_sources
DROP TRIGGER IF EXISTS set_updated_at_lead_sources ON public.lead_sources;
CREATE TRIGGER set_updated_at_lead_sources
  BEFORE UPDATE ON public.lead_sources
  FOR EACH ROW
  WHEN (OLD.* IS DISTINCT FROM NEW.*)
  EXECUTE FUNCTION public.trigger_set_updated_at();

-- For profiles
DROP TRIGGER IF EXISTS set_updated_at_profiles ON public.profiles;
CREATE TRIGGER set_updated_at_profiles
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  WHEN (OLD.* IS DISTINCT FROM NEW.*)
  EXECUTE FUNCTION public.trigger_set_updated_at();

-- For leads
DROP TRIGGER IF EXISTS set_updated_at_leads ON public.leads;
CREATE TRIGGER set_updated_at_leads
  BEFORE UPDATE ON public.leads
  FOR EACH ROW
  WHEN (OLD.* IS DISTINCT FROM NEW.*)
  EXECUTE FUNCTION public.trigger_set_updated_at();

-- For clients
DROP TRIGGER IF EXISTS set_updated_at_clients ON public.clients;
CREATE TRIGGER set_updated_at_clients
  BEFORE UPDATE ON public.clients
  FOR EACH ROW
  WHEN (OLD.* IS DISTINCT FROM NEW.*)
  EXECUTE FUNCTION public.trigger_set_updated_at();

-- For people
DROP TRIGGER IF EXISTS set_updated_at_people ON public.people;
CREATE TRIGGER set_updated_at_people
  BEFORE UPDATE ON public.people
  FOR EACH ROW
  WHEN (OLD.* IS DISTINCT FROM NEW.*)
  EXECUTE FUNCTION public.trigger_set_updated_at();

-- Note: Run this migration in Supabase SQL Editor
-- The WHEN clause ensures the trigger only fires when actual data changes,
-- preventing the infinite recursion that caused "stack depth limit exceeded"
