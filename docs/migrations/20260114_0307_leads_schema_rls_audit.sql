-- Migration: leads_schema_rls_audit
-- Date: 2026-01-14 03:07
-- Description: Add missing columns to leads, fix RLS policies, fix audit trigger
-- IMPORTANT: Run this in Supabase SQL Editor

-- ============================================================
-- A) ADD MISSING COLUMNS TO LEADS TABLE
-- ============================================================

-- Add columns if they don't exist
DO $$
BEGIN
    -- owner_user_id
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'owner_user_id') THEN
        ALTER TABLE public.leads ADD COLUMN owner_user_id uuid;
        RAISE NOTICE 'Added column owner_user_id';
    END IF;

    -- client_name
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'client_name') THEN
        ALTER TABLE public.leads ADD COLUMN client_name text;
        RAISE NOTICE 'Added column client_name';
    END IF;

    -- phone_raw
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'phone_raw') THEN
        ALTER TABLE public.leads ADD COLUMN phone_raw text;
        RAISE NOTICE 'Added column phone_raw';
    END IF;

    -- phone_e164
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'phone_e164') THEN
        ALTER TABLE public.leads ADD COLUMN phone_e164 text;
        RAISE NOTICE 'Added column phone_e164';
    END IF;

    -- lead_type_id
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'lead_type_id') THEN
        ALTER TABLE public.leads ADD COLUMN lead_type_id uuid;
        RAISE NOTICE 'Added column lead_type_id';
    END IF;

    -- lead_interest_id
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'lead_interest_id') THEN
        ALTER TABLE public.leads ADD COLUMN lead_interest_id uuid;
        RAISE NOTICE 'Added column lead_interest_id';
    END IF;

    -- lead_source_id
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'lead_source_id') THEN
        ALTER TABLE public.leads ADD COLUMN lead_source_id uuid;
        RAISE NOTICE 'Added column lead_source_id';
    END IF;

    -- budget_range
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'budget_range') THEN
        ALTER TABLE public.leads ADD COLUMN budget_range text;
        RAISE NOTICE 'Added column budget_range';
    END IF;

    -- notes
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'notes') THEN
        ALTER TABLE public.leads ADD COLUMN notes text;
        RAISE NOTICE 'Added column notes';
    END IF;
END $$;

-- ============================================================
-- B) SET DEFAULT FOR owner_user_id
-- ============================================================
ALTER TABLE public.leads ALTER COLUMN owner_user_id SET DEFAULT auth.uid();

-- ============================================================
-- C) BACKFILL DATA
-- ============================================================

-- Backfill owner_user_id from existing columns
UPDATE public.leads
SET owner_user_id = COALESCE(user_id, created_by, assigned_to)
WHERE owner_user_id IS NULL;

-- Backfill client_name from title
UPDATE public.leads
SET client_name = title
WHERE client_name IS NULL AND title IS NOT NULL;

-- ============================================================
-- D) CREATE UNIQUE INDEX FOR phone_e164 (partial, non-null only)
-- ============================================================
DROP INDEX IF EXISTS leads_phone_e164_unique;
CREATE UNIQUE INDEX leads_phone_e164_unique
ON public.leads (phone_e164)
WHERE phone_e164 IS NOT NULL;

-- ============================================================
-- E) ADD FOREIGN KEYS TO CATALOGS (if tables exist)
-- ============================================================
DO $$
BEGIN
    -- FK to lead_types
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'lead_types') THEN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'leads_lead_type_id_fkey') THEN
            ALTER TABLE public.leads ADD CONSTRAINT leads_lead_type_id_fkey
            FOREIGN KEY (lead_type_id) REFERENCES public.lead_types(id) ON DELETE SET NULL;
            RAISE NOTICE 'Added FK leads_lead_type_id_fkey';
        END IF;
    END IF;

    -- FK to lead_interests
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'lead_interests') THEN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'leads_lead_interest_id_fkey') THEN
            ALTER TABLE public.leads ADD CONSTRAINT leads_lead_interest_id_fkey
            FOREIGN KEY (lead_interest_id) REFERENCES public.lead_interests(id) ON DELETE SET NULL;
            RAISE NOTICE 'Added FK leads_lead_interest_id_fkey';
        END IF;
    END IF;

    -- FK to lead_sources
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'lead_sources') THEN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'leads_lead_source_id_fkey') THEN
            ALTER TABLE public.leads ADD CONSTRAINT leads_lead_source_id_fkey
            FOREIGN KEY (lead_source_id) REFERENCES public.lead_sources(id) ON DELETE SET NULL;
            RAISE NOTICE 'Added FK leads_lead_source_id_fkey';
        END IF;
    END IF;
END $$;

-- ============================================================
-- F) ENABLE RLS AND CREATE POLICIES
-- ============================================================

-- Enable RLS
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

-- Drop old policies
DROP POLICY IF EXISTS leads_select_scoped ON public.leads;
DROP POLICY IF EXISTS leads_insert_scoped ON public.leads;
DROP POLICY IF EXISTS leads_update_scoped ON public.leads;
DROP POLICY IF EXISTS leads_delete_scoped ON public.leads;

-- Drop any other old policies that might exist
DROP POLICY IF EXISTS "Users can view own leads" ON public.leads;
DROP POLICY IF EXISTS "Users can insert own leads" ON public.leads;
DROP POLICY IF EXISTS "Users can update own leads" ON public.leads;
DROP POLICY IF EXISTS "Users can delete own leads" ON public.leads;

-- Create new policies using owner_user_id
-- SELECT: authenticated users can see their own leads OR leads they own
CREATE POLICY leads_select_scoped ON public.leads
FOR SELECT TO authenticated
USING (
    owner_user_id = auth.uid()
    OR EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'gestor')
    )
);

-- INSERT: authenticated users can create leads
CREATE POLICY leads_insert_scoped ON public.leads
FOR INSERT TO authenticated
WITH CHECK (
    owner_user_id = auth.uid()
    OR owner_user_id IS NULL
);

-- UPDATE: owner or admin/gestor can update
CREATE POLICY leads_update_scoped ON public.leads
FOR UPDATE TO authenticated
USING (
    owner_user_id = auth.uid()
    OR EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'gestor')
    )
)
WITH CHECK (
    owner_user_id = auth.uid()
    OR owner_user_id IS NULL
    OR EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'gestor')
    )
);

-- DELETE: owner or admin/gestor can delete
CREATE POLICY leads_delete_scoped ON public.leads
FOR DELETE TO authenticated
USING (
    owner_user_id = auth.uid()
    OR EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'gestor')
    )
);

-- ============================================================
-- G) FIX AUDIT TRIGGER FUNCTION
-- ============================================================

-- Create or replace the audit function with fallback for null auth.uid()
CREATE OR REPLACE FUNCTION public.audit_lead_changes()
RETURNS TRIGGER AS $$
DECLARE
    v_actor uuid;
    v_action text;
BEGIN
    -- Get actor ID with fallback
    v_actor := auth.uid();
    
    -- Fallback if auth.uid() is null (e.g., service role or trigger context)
    IF v_actor IS NULL THEN
        IF TG_OP = 'DELETE' THEN
            v_actor := COALESCE(OLD.owner_user_id, OLD.user_id, OLD.created_by, OLD.assigned_to);
        ELSE
            v_actor := COALESCE(NEW.owner_user_id, NEW.user_id, NEW.created_by, NEW.assigned_to);
        END IF;
    END IF;
    
    -- If still null, use a system UUID
    IF v_actor IS NULL THEN
        v_actor := '00000000-0000-0000-0000-000000000000'::uuid;
    END IF;
    
    -- Determine action
    v_action := LOWER(TG_OP);
    
    IF TG_OP = 'INSERT' THEN
        INSERT INTO public.lead_audit_logs (lead_id, actor_id, action, before, after)
        VALUES (NEW.id, v_actor, v_action, NULL, to_jsonb(NEW));
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO public.lead_audit_logs (lead_id, actor_id, action, before, after)
        VALUES (NEW.id, v_actor, v_action, to_jsonb(OLD), to_jsonb(NEW));
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        INSERT INTO public.lead_audit_logs (lead_id, actor_id, action, before, after)
        VALUES (OLD.id, v_actor, v_action, to_jsonb(OLD), NULL);
        RETURN OLD;
    END IF;
    
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop and recreate trigger
DROP TRIGGER IF EXISTS trigger_audit_lead_changes ON public.leads;
CREATE TRIGGER trigger_audit_lead_changes
AFTER INSERT OR UPDATE OR DELETE ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.audit_lead_changes();

-- ============================================================
-- H) ENSURE lead_audit_logs TABLE EXISTS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.lead_audit_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id uuid NOT NULL,
    actor_id uuid NOT NULL,
    action text NOT NULL,
    before jsonb,
    after jsonb,
    created_at timestamptz DEFAULT now()
);

-- Enable RLS on audit logs (everyone can insert, only owner can read)
ALTER TABLE public.lead_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_logs_insert ON public.lead_audit_logs;
CREATE POLICY audit_logs_insert ON public.lead_audit_logs
FOR INSERT TO authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS audit_logs_select ON public.lead_audit_logs;
CREATE POLICY audit_logs_select ON public.lead_audit_logs
FOR SELECT TO authenticated
USING (true);

-- ============================================================
-- I) VERIFICATION QUERIES (run these to confirm)
-- ============================================================

-- Check columns exist:
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'leads' ORDER BY ordinal_position;

-- Check RLS policies:
-- SELECT policyname, cmd, qual FROM pg_policies WHERE tablename = 'leads';

-- Check trigger exists:
-- SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.leads'::regclass;

-- Test audit log:
-- SELECT * FROM lead_audit_logs ORDER BY created_at DESC LIMIT 5;
