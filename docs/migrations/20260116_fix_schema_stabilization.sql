-- ============================================================
-- MIGRATION: Schema Stabilization for Vitrya CRM
-- Date: 2025-01-16
-- Purpose: Fix all schema mismatches, create missing tables,
--          fix recursive triggers, and seed essential data
-- ============================================================
-- Run this ENTIRE script in Supabase SQL Editor
-- ============================================================

-- ============================================================
-- PART A: CREATE/FIX CORE TABLES
-- ============================================================

-- 1) PIPELINES TABLE
CREATE TABLE IF NOT EXISTS public.pipelines (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    type text NOT NULL DEFAULT 'sales' CHECK (type IN ('sales', 'rent')),
    description text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Add type column if missing
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'public' AND table_name = 'pipelines' AND column_name = 'type') THEN
        ALTER TABLE public.pipelines ADD COLUMN type text NOT NULL DEFAULT 'sales' CHECK (type IN ('sales', 'rent'));
    END IF;
END $$;

-- 2) PIPELINE STAGES TABLE
CREATE TABLE IF NOT EXISTS public.pipeline_stages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    pipeline_id uuid NOT NULL REFERENCES public.pipelines(id) ON DELETE CASCADE,
    name text NOT NULL,
    position integer NOT NULL DEFAULT 0,
    created_at timestamptz DEFAULT now()
);

-- 3) LEAD CATALOGS
CREATE TABLE IF NOT EXISTS public.lead_types (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL UNIQUE,
    position integer NOT NULL DEFAULT 0,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.lead_interests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL UNIQUE,
    position integer NOT NULL DEFAULT 0,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.lead_sources (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL UNIQUE,
    position integer NOT NULL DEFAULT 0,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- 4) PEOPLE TABLE (unified person registry)
CREATE TABLE IF NOT EXISTS public.people (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name text NOT NULL,
    phone_e164 text,
    email text,
    notes text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_people_phone_e164 ON public.people(phone_e164);
CREATE INDEX IF NOT EXISTS idx_people_email ON public.people(email);

-- 5) PROFILES TABLE
CREATE TABLE IF NOT EXISTS public.profiles (
    id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name text,
    email text,
    phone_e164 text,
    role text NOT NULL DEFAULT 'corretor' CHECK (role IN ('admin', 'gestor', 'corretor')),
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Add missing columns to profiles
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'phone_e164') THEN
        ALTER TABLE public.profiles ADD COLUMN phone_e164 text;
    END IF;
END $$;

-- 6) CLIENTS TABLE - uses owner_user_id
CREATE TABLE IF NOT EXISTS public.clients (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    person_id uuid NOT NULL REFERENCES public.people(id) ON DELETE RESTRICT,
    owner_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    types text[],
    notes text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT clients_person_id_unique UNIQUE(person_id)
);

-- Add missing columns to clients if table exists with different schema
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'clients' AND column_name = 'person_id') THEN
        ALTER TABLE public.clients ADD COLUMN person_id uuid REFERENCES public.people(id) ON DELETE RESTRICT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'clients' AND column_name = 'owner_user_id') THEN
        ALTER TABLE public.clients ADD COLUMN owner_user_id uuid REFERENCES public.profiles(id) ON DELETE RESTRICT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'clients' AND column_name = 'status') THEN
        ALTER TABLE public.clients ADD COLUMN status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'clients' AND column_name = 'types') THEN
        ALTER TABLE public.clients ADD COLUMN types text[];
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_clients_owner_user_id ON public.clients(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_clients_status ON public.clients(status);

-- 7) LEADS TABLE
CREATE TABLE IF NOT EXISTS public.leads (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    title text NOT NULL,
    status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'won', 'lost')),
    pipeline_id uuid REFERENCES public.pipelines(id) ON DELETE SET NULL,
    stage_id uuid REFERENCES public.pipeline_stages(id) ON DELETE SET NULL,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    owner_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
    user_id uuid,
    client_name text,
    phone_raw text,
    phone_e164 text,
    email text,
    lead_type_id uuid REFERENCES public.lead_types(id) ON DELETE SET NULL,
    lead_interest_id uuid REFERENCES public.lead_interests(id) ON DELETE SET NULL,
    lead_source_id uuid REFERENCES public.lead_sources(id) ON DELETE SET NULL,
    budget_range text,
    notes text,
    person_id uuid REFERENCES public.people(id) ON DELETE SET NULL,
    client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
    is_converted boolean NOT NULL DEFAULT false,
    converted_at timestamptz
);

-- Add missing columns to leads
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'person_id') THEN
        ALTER TABLE public.leads ADD COLUMN person_id uuid REFERENCES public.people(id) ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'client_id') THEN
        ALTER TABLE public.leads ADD COLUMN client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'is_converted') THEN
        ALTER TABLE public.leads ADD COLUMN is_converted boolean NOT NULL DEFAULT false;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'converted_at') THEN
        ALTER TABLE public.leads ADD COLUMN converted_at timestamptz;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'email') THEN
        ALTER TABLE public.leads ADD COLUMN email text;
    END IF;
END $$;

-- Indexes for leads
CREATE UNIQUE INDEX IF NOT EXISTS leads_phone_e164_unique ON public.leads (phone_e164) WHERE phone_e164 IS NOT NULL;
CREATE INDEX IF NOT EXISTS leads_pipeline_id_idx ON public.leads(pipeline_id);
CREATE INDEX IF NOT EXISTS leads_stage_id_idx ON public.leads(stage_id);
CREATE INDEX IF NOT EXISTS leads_status_idx ON public.leads(status);
CREATE INDEX IF NOT EXISTS leads_owner_user_id_idx ON public.leads(owner_user_id);

-- 8) LEAD AUDIT LOGS
CREATE TABLE IF NOT EXISTS public.lead_audit_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
    actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    action text NOT NULL,
    before jsonb,
    after jsonb,
    details jsonb,
    created_at timestamptz DEFAULT now()
);

-- Add details column if missing
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'lead_audit_logs' AND column_name = 'details') THEN
        ALTER TABLE public.lead_audit_logs ADD COLUMN details jsonb;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS lead_audit_logs_lead_id_idx ON public.lead_audit_logs(lead_id);
CREATE INDEX IF NOT EXISTS lead_audit_logs_created_at_idx ON public.lead_audit_logs(created_at DESC);

-- 9) LEAD NOTES TABLE
CREATE TABLE IF NOT EXISTS public.lead_notes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    content text NOT NULL,
    created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lead_notes_lead_id_idx ON public.lead_notes(lead_id);

-- 10) TASKS TABLE
CREATE TABLE IF NOT EXISTS public.tasks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
    title text NOT NULL,
    type text NOT NULL DEFAULT 'follow_up',
    status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'completed', 'cancelled')),
    due_at timestamptz,
    notes text,
    assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at timestamptz DEFAULT now(),
    completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS tasks_lead_id_idx ON public.tasks(lead_id);
CREATE INDEX IF NOT EXISTS tasks_status_idx ON public.tasks(status);
CREATE INDEX IF NOT EXISTS tasks_due_at_idx ON public.tasks(due_at);

-- ============================================================
-- PART B: FIX RECURSIVE TRIGGERS
-- ============================================================

-- Create a safe updated_at trigger function that prevents recursion
CREATE OR REPLACE FUNCTION public.trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop and recreate triggers with WHEN clause to prevent recursion

-- lead_types
DROP TRIGGER IF EXISTS set_updated_at_lead_types ON public.lead_types;
DROP TRIGGER IF EXISTS lead_types_updated_at ON public.lead_types;
CREATE TRIGGER set_updated_at_lead_types
  BEFORE UPDATE ON public.lead_types
  FOR EACH ROW
  WHEN (OLD.name IS DISTINCT FROM NEW.name OR OLD.position IS DISTINCT FROM NEW.position OR OLD.is_active IS DISTINCT FROM NEW.is_active)
  EXECUTE FUNCTION public.trigger_set_updated_at();

-- lead_interests
DROP TRIGGER IF EXISTS set_updated_at_lead_interests ON public.lead_interests;
DROP TRIGGER IF EXISTS lead_interests_updated_at ON public.lead_interests;
CREATE TRIGGER set_updated_at_lead_interests
  BEFORE UPDATE ON public.lead_interests
  FOR EACH ROW
  WHEN (OLD.name IS DISTINCT FROM NEW.name OR OLD.position IS DISTINCT FROM NEW.position OR OLD.is_active IS DISTINCT FROM NEW.is_active)
  EXECUTE FUNCTION public.trigger_set_updated_at();

-- lead_sources
DROP TRIGGER IF EXISTS set_updated_at_lead_sources ON public.lead_sources;
DROP TRIGGER IF EXISTS lead_sources_updated_at ON public.lead_sources;
CREATE TRIGGER set_updated_at_lead_sources
  BEFORE UPDATE ON public.lead_sources
  FOR EACH ROW
  WHEN (OLD.name IS DISTINCT FROM NEW.name OR OLD.position IS DISTINCT FROM NEW.position OR OLD.is_active IS DISTINCT FROM NEW.is_active)
  EXECUTE FUNCTION public.trigger_set_updated_at();

-- profiles
DROP TRIGGER IF EXISTS set_updated_at_profiles ON public.profiles;
DROP TRIGGER IF EXISTS profiles_updated_at ON public.profiles;
CREATE TRIGGER set_updated_at_profiles
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  WHEN (OLD.full_name IS DISTINCT FROM NEW.full_name OR OLD.email IS DISTINCT FROM NEW.email OR OLD.role IS DISTINCT FROM NEW.role OR OLD.is_active IS DISTINCT FROM NEW.is_active OR OLD.phone_e164 IS DISTINCT FROM NEW.phone_e164)
  EXECUTE FUNCTION public.trigger_set_updated_at();

-- leads (only fire when non-timestamp fields change)
DROP TRIGGER IF EXISTS set_updated_at_leads ON public.leads;
DROP TRIGGER IF EXISTS leads_updated_at ON public.leads;
CREATE TRIGGER set_updated_at_leads
  BEFORE UPDATE ON public.leads
  FOR EACH ROW
  WHEN (
    OLD.title IS DISTINCT FROM NEW.title OR
    OLD.status IS DISTINCT FROM NEW.status OR
    OLD.pipeline_id IS DISTINCT FROM NEW.pipeline_id OR
    OLD.stage_id IS DISTINCT FROM NEW.stage_id OR
    OLD.client_name IS DISTINCT FROM NEW.client_name OR
    OLD.phone_e164 IS DISTINCT FROM NEW.phone_e164 OR
    OLD.email IS DISTINCT FROM NEW.email OR
    OLD.notes IS DISTINCT FROM NEW.notes OR
    OLD.assigned_to IS DISTINCT FROM NEW.assigned_to OR
    OLD.person_id IS DISTINCT FROM NEW.person_id OR
    OLD.client_id IS DISTINCT FROM NEW.client_id OR
    OLD.is_converted IS DISTINCT FROM NEW.is_converted
  )
  EXECUTE FUNCTION public.trigger_set_updated_at();

-- clients
DROP TRIGGER IF EXISTS set_updated_at_clients ON public.clients;
DROP TRIGGER IF EXISTS clients_updated_at ON public.clients;
CREATE TRIGGER set_updated_at_clients
  BEFORE UPDATE ON public.clients
  FOR EACH ROW
  WHEN (
    OLD.status IS DISTINCT FROM NEW.status OR
    OLD.types IS DISTINCT FROM NEW.types OR
    OLD.notes IS DISTINCT FROM NEW.notes OR
    OLD.owner_user_id IS DISTINCT FROM NEW.owner_user_id
  )
  EXECUTE FUNCTION public.trigger_set_updated_at();

-- people
DROP TRIGGER IF EXISTS set_updated_at_people ON public.people;
DROP TRIGGER IF EXISTS people_updated_at ON public.people;
CREATE TRIGGER set_updated_at_people
  BEFORE UPDATE ON public.people
  FOR EACH ROW
  WHEN (
    OLD.full_name IS DISTINCT FROM NEW.full_name OR
    OLD.phone_e164 IS DISTINCT FROM NEW.phone_e164 OR
    OLD.email IS DISTINCT FROM NEW.email OR
    OLD.notes IS DISTINCT FROM NEW.notes
  )
  EXECUTE FUNCTION public.trigger_set_updated_at();

-- ============================================================
-- PART C: RLS POLICIES
-- ============================================================

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pipelines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pipeline_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_interests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.people ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_audit_logs ENABLE ROW LEVEL SECURITY;

-- PROFILES: authenticated users can read all profiles (needed for user listings), users can update their own
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;
CREATE POLICY "Users can view all profiles" ON public.profiles FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE 
  USING (auth.uid() = id) 
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Admins can insert profiles" ON public.profiles;
CREATE POLICY "Admins can insert profiles" ON public.profiles FOR INSERT 
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    OR NOT EXISTS (SELECT 1 FROM public.profiles) -- Allow first user
  );

-- LEADS: role-based access (admin/gestor see all, corretor sees own)
DROP POLICY IF EXISTS "Leads access policy" ON public.leads;
CREATE POLICY "Leads access policy" ON public.leads FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
        AND (
            p.role IN ('admin', 'gestor')
            OR leads.owner_user_id = auth.uid()
            OR leads.assigned_to = auth.uid()
            OR leads.created_by = auth.uid()
        )
    )
);

DROP POLICY IF EXISTS "Leads insert policy" ON public.leads;
CREATE POLICY "Leads insert policy" ON public.leads FOR INSERT 
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Leads update policy" ON public.leads;
CREATE POLICY "Leads update policy" ON public.leads FOR UPDATE USING (
    EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
        AND (
            p.role IN ('admin', 'gestor')
            OR leads.owner_user_id = auth.uid()
            OR leads.assigned_to = auth.uid()
            OR leads.created_by = auth.uid()
        )
    )
) WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
        AND (
            p.role IN ('admin', 'gestor')
            OR leads.owner_user_id = auth.uid()
            OR leads.assigned_to = auth.uid()
        )
    )
);

DROP POLICY IF EXISTS "Leads delete policy" ON public.leads;
CREATE POLICY "Leads delete policy" ON public.leads FOR DELETE USING (
    EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'gestor')
    )
);

-- PIPELINES/STAGES: everyone can read
DROP POLICY IF EXISTS "Everyone can read pipelines" ON public.pipelines;
CREATE POLICY "Everyone can read pipelines" ON public.pipelines FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Admins can manage pipelines" ON public.pipelines;
CREATE POLICY "Admins can manage pipelines" ON public.pipelines FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

DROP POLICY IF EXISTS "Everyone can read stages" ON public.pipeline_stages;
CREATE POLICY "Everyone can read stages" ON public.pipeline_stages FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Admins can manage stages" ON public.pipeline_stages;
CREATE POLICY "Admins can manage stages" ON public.pipeline_stages FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

-- CATALOGS: everyone can read, admins can modify
DROP POLICY IF EXISTS "Everyone can read lead_types" ON public.lead_types;
CREATE POLICY "Everyone can read lead_types" ON public.lead_types FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Admins can modify lead_types" ON public.lead_types;
CREATE POLICY "Admins can modify lead_types" ON public.lead_types FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

DROP POLICY IF EXISTS "Everyone can read lead_interests" ON public.lead_interests;
CREATE POLICY "Everyone can read lead_interests" ON public.lead_interests FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Admins can modify lead_interests" ON public.lead_interests;
CREATE POLICY "Admins can modify lead_interests" ON public.lead_interests FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

DROP POLICY IF EXISTS "Everyone can read lead_sources" ON public.lead_sources;
CREATE POLICY "Everyone can read lead_sources" ON public.lead_sources FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Admins can modify lead_sources" ON public.lead_sources;
CREATE POLICY "Admins can modify lead_sources" ON public.lead_sources FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

-- PEOPLE: authenticated users can read, owner/admin can modify
DROP POLICY IF EXISTS "people_select_all" ON public.people;
CREATE POLICY "people_select_all" ON public.people FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "people_insert_authenticated" ON public.people;
CREATE POLICY "people_insert_authenticated" ON public.people FOR INSERT 
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "people_update_authenticated" ON public.people;
CREATE POLICY "people_update_authenticated" ON public.people FOR UPDATE 
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'gestor'))
    OR EXISTS (SELECT 1 FROM public.clients WHERE person_id = people.id AND owner_user_id = auth.uid())
  );

-- CLIENTS: owner or admin/gestor can access
DROP POLICY IF EXISTS "clients_select_own_or_admin" ON public.clients;
CREATE POLICY "clients_select_own_or_admin" ON public.clients FOR SELECT USING (
    owner_user_id = auth.uid() OR
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'gestor'))
);

DROP POLICY IF EXISTS "clients_insert_authenticated" ON public.clients;
CREATE POLICY "clients_insert_authenticated" ON public.clients FOR INSERT 
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "clients_update_own_or_admin" ON public.clients;
CREATE POLICY "clients_update_own_or_admin" ON public.clients FOR UPDATE USING (
    owner_user_id = auth.uid() OR
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'gestor'))
);

-- LEAD AUDIT LOGS: access follows lead ownership
DROP POLICY IF EXISTS "Lead audit logs access" ON public.lead_audit_logs;
CREATE POLICY "Lead audit logs access" ON public.lead_audit_logs FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.leads l
        JOIN public.profiles p ON p.id = auth.uid()
        WHERE l.id = lead_audit_logs.lead_id
        AND (
            p.role IN ('admin', 'gestor')
            OR l.owner_user_id = auth.uid()
            OR l.assigned_to = auth.uid()
        )
    )
);

DROP POLICY IF EXISTS "Lead audit logs insert" ON public.lead_audit_logs;
CREATE POLICY "Lead audit logs insert" ON public.lead_audit_logs FOR INSERT 
  WITH CHECK (auth.uid() IS NOT NULL);

-- LEAD NOTES: access follows lead ownership
DROP POLICY IF EXISTS "Lead notes access policy" ON public.lead_notes;
CREATE POLICY "Lead notes access policy" ON public.lead_notes FOR ALL USING (
    EXISTS (
        SELECT 1 FROM public.leads l
        JOIN public.profiles p ON p.id = auth.uid()
        WHERE l.id = lead_notes.lead_id
        AND (
            p.role IN ('admin', 'gestor')
            OR l.owner_user_id = auth.uid()
            OR l.assigned_to = auth.uid()
        )
    )
);

-- TASKS: access follows lead ownership
DROP POLICY IF EXISTS "Tasks access policy" ON public.tasks;
CREATE POLICY "Tasks access policy" ON public.tasks FOR ALL USING (
    EXISTS (
        SELECT 1 FROM public.leads l
        JOIN public.profiles p ON p.id = auth.uid()
        WHERE l.id = tasks.lead_id
        AND (
            p.role IN ('admin', 'gestor')
            OR l.owner_user_id = auth.uid()
            OR l.assigned_to = auth.uid()
        )
    )
    OR tasks.assigned_to = auth.uid()
    OR tasks.created_by = auth.uid()
);

-- ============================================================
-- PART D: SEED DATA
-- ============================================================

-- Seed default pipeline if none exists
INSERT INTO public.pipelines (id, name, type)
SELECT '00000000-0000-0000-0000-000000000001', 'Pipeline de Vendas', 'sales'
WHERE NOT EXISTS (SELECT 1 FROM public.pipelines WHERE id = '00000000-0000-0000-0000-000000000001');

INSERT INTO public.pipelines (id, name, type)
SELECT '00000000-0000-0000-0000-000000000002', 'Pipeline de Locação', 'rent'
WHERE NOT EXISTS (SELECT 1 FROM public.pipelines WHERE id = '00000000-0000-0000-0000-000000000002');

-- Fix invalid pipeline types
UPDATE public.pipelines SET type = 'sales' WHERE type NOT IN ('sales', 'rent');

-- Seed stages for sales pipeline if none exist
INSERT INTO public.pipeline_stages (id, pipeline_id, name, position)
SELECT gen_random_uuid(), '00000000-0000-0000-0000-000000000001', 'Novo', 0
WHERE NOT EXISTS (SELECT 1 FROM public.pipeline_stages WHERE pipeline_id = '00000000-0000-0000-0000-000000000001' AND name = 'Novo');

INSERT INTO public.pipeline_stages (id, pipeline_id, name, position)
SELECT gen_random_uuid(), '00000000-0000-0000-0000-000000000001', 'Contato', 1
WHERE NOT EXISTS (SELECT 1 FROM public.pipeline_stages WHERE pipeline_id = '00000000-0000-0000-0000-000000000001' AND name = 'Contato');

INSERT INTO public.pipeline_stages (id, pipeline_id, name, position)
SELECT gen_random_uuid(), '00000000-0000-0000-0000-000000000001', 'Qualificação', 2
WHERE NOT EXISTS (SELECT 1 FROM public.pipeline_stages WHERE pipeline_id = '00000000-0000-0000-0000-000000000001' AND name = 'Qualificação');

INSERT INTO public.pipeline_stages (id, pipeline_id, name, position)
SELECT gen_random_uuid(), '00000000-0000-0000-0000-000000000001', 'Proposta', 3
WHERE NOT EXISTS (SELECT 1 FROM public.pipeline_stages WHERE pipeline_id = '00000000-0000-0000-0000-000000000001' AND name = 'Proposta');

INSERT INTO public.pipeline_stages (id, pipeline_id, name, position)
SELECT gen_random_uuid(), '00000000-0000-0000-0000-000000000001', 'Negociação', 4
WHERE NOT EXISTS (SELECT 1 FROM public.pipeline_stages WHERE pipeline_id = '00000000-0000-0000-0000-000000000001' AND name = 'Negociação');

-- Seed stages for rent pipeline
INSERT INTO public.pipeline_stages (id, pipeline_id, name, position)
SELECT gen_random_uuid(), '00000000-0000-0000-0000-000000000002', 'Novo', 0
WHERE NOT EXISTS (SELECT 1 FROM public.pipeline_stages WHERE pipeline_id = '00000000-0000-0000-0000-000000000002' AND name = 'Novo');

INSERT INTO public.pipeline_stages (id, pipeline_id, name, position)
SELECT gen_random_uuid(), '00000000-0000-0000-0000-000000000002', 'Visita', 1
WHERE NOT EXISTS (SELECT 1 FROM public.pipeline_stages WHERE pipeline_id = '00000000-0000-0000-0000-000000000002' AND name = 'Visita');

INSERT INTO public.pipeline_stages (id, pipeline_id, name, position)
SELECT gen_random_uuid(), '00000000-0000-0000-0000-000000000002', 'Documentação', 2
WHERE NOT EXISTS (SELECT 1 FROM public.pipeline_stages WHERE pipeline_id = '00000000-0000-0000-0000-000000000002' AND name = 'Documentação');

INSERT INTO public.pipeline_stages (id, pipeline_id, name, position)
SELECT gen_random_uuid(), '00000000-0000-0000-0000-000000000002', 'Contrato', 3
WHERE NOT EXISTS (SELECT 1 FROM public.pipeline_stages WHERE pipeline_id = '00000000-0000-0000-0000-000000000002' AND name = 'Contrato');

-- ============================================================
-- SAFETY PATCH (Fix 42P10): guarantee UNIQUE(name) for catalogs
-- even if tables pre-existed without the constraint.
-- Also remove duplicates before adding the unique constraint.
-- ============================================================

-- lead_types: remove duplicates by name (keep oldest created_at)
DELETE FROM public.lead_types a
USING public.lead_types b
WHERE a.id <> b.id
  AND a.name = b.name
  AND a.created_at > b.created_at;

-- lead_interests: remove duplicates by name (keep oldest created_at)
DELETE FROM public.lead_interests a
USING public.lead_interests b
WHERE a.id <> b.id
  AND a.name = b.name
  AND a.created_at > b.created_at;

-- lead_sources: remove duplicates by name (keep oldest created_at)
DELETE FROM public.lead_sources a
USING public.lead_sources b
WHERE a.id <> b.id
  AND a.name = b.name
  AND a.created_at > b.created_at;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'lead_types_name_unique'
  ) THEN
    ALTER TABLE public.lead_types
      ADD CONSTRAINT lead_types_name_unique UNIQUE (name);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'lead_interests_name_unique'
  ) THEN
    ALTER TABLE public.lead_interests
      ADD CONSTRAINT lead_interests_name_unique UNIQUE (name);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'lead_sources_name_unique'
  ) THEN
    ALTER TABLE public.lead_sources
      ADD CONSTRAINT lead_sources_name_unique UNIQUE (name);
  END IF;
END $$;

-- Seed catalogs if empty
INSERT INTO public.lead_types (name, position, is_active) VALUES ('Compra', 0, true) ON CONFLICT (name) DO NOTHING;
INSERT INTO public.lead_types (name, position, is_active) VALUES ('Venda', 1, true) ON CONFLICT (name) DO NOTHING;
INSERT INTO public.lead_types (name, position, is_active) VALUES ('Aluguel', 2, true) ON CONFLICT (name) DO NOTHING;
INSERT INTO public.lead_types (name, position, is_active) VALUES ('Investimento', 3, true) ON CONFLICT (name) DO NOTHING;

INSERT INTO public.lead_interests (name, position, is_active) VALUES ('Apartamento', 0, true) ON CONFLICT (name) DO NOTHING;
INSERT INTO public.lead_interests (name, position, is_active) VALUES ('Casa', 1, true) ON CONFLICT (name) DO NOTHING;
INSERT INTO public.lead_interests (name, position, is_active) VALUES ('Terreno', 2, true) ON CONFLICT (name) DO NOTHING;
INSERT INTO public.lead_interests (name, position, is_active) VALUES ('Comercial', 3, true) ON CONFLICT (name) DO NOTHING;
INSERT INTO public.lead_interests (name, position, is_active) VALUES ('Rural', 4, true) ON CONFLICT (name) DO NOTHING;

INSERT INTO public.lead_sources (name, position, is_active) VALUES ('Site', 0, true) ON CONFLICT (name) DO NOTHING;
INSERT INTO public.lead_sources (name, position, is_active) VALUES ('Indicação', 1, true) ON CONFLICT (name) DO NOTHING;
INSERT INTO public.lead_sources (name, position, is_active) VALUES ('Instagram', 2, true) ON CONFLICT (name) DO NOTHING;
INSERT INTO public.lead_sources (name, position, is_active) VALUES ('Facebook', 3, true) ON CONFLICT (name) DO NOTHING;
INSERT INTO public.lead_sources (name, position, is_active) VALUES ('Google', 4, true) ON CONFLICT (name) DO NOTHING;
INSERT INTO public.lead_sources (name, position, is_active) VALUES ('Portal Imobiliário', 5, true) ON CONFLICT (name) DO NOTHING;
INSERT INTO public.lead_sources (name, position, is_active) VALUES ('Outro', 6, true) ON CONFLICT (name) DO NOTHING;

-- ============================================================
-- DONE!
-- ============================================================
-- CHECKLIST DE TESTES MANUAIS:
-- 
-- 1. /settings/users - Lista todos os usuários (admin vê todos)
-- 2. /settings/catalogs - Editar catálogos funciona sem "stack depth limit exceeded"
-- 3. /leads/kanban - Mostra pipelines e stages corretamente
-- 4. Converter lead em cliente - Funciona sem erro PGRST204
-- 
-- Execute: npm run build
-- ============================================================
