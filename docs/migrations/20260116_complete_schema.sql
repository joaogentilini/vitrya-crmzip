-- Complete Schema Migration for Vitrya CRM
-- Run this in Supabase SQL Editor
-- This creates all necessary tables from scratch

-- ============================================================
-- 1) PIPELINES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.pipelines (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- ============================================================
-- 2) PIPELINE STAGES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.pipeline_stages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    pipeline_id uuid REFERENCES public.pipelines(id) ON DELETE CASCADE,
    name text NOT NULL,
    position integer NOT NULL DEFAULT 0,
    created_at timestamptz DEFAULT now()
);

-- ============================================================
-- 3) LEAD CATALOGS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.lead_types (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    position integer NOT NULL DEFAULT 0,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.lead_interests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    position integer NOT NULL DEFAULT 0,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.lead_sources (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    position integer NOT NULL DEFAULT 0,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- ============================================================
-- 4) LEADS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.leads (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    title text NOT NULL,
    status text NOT NULL DEFAULT 'open',
    pipeline_id uuid REFERENCES public.pipelines(id),
    stage_id uuid REFERENCES public.pipeline_stages(id),
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    created_by uuid,
    assigned_to uuid,
    owner_user_id uuid DEFAULT auth.uid(),
    user_id uuid,
    client_name text,
    phone_raw text,
    phone_e164 text,
    email text,
    lead_type_id uuid REFERENCES public.lead_types(id) ON DELETE SET NULL,
    lead_interest_id uuid REFERENCES public.lead_interests(id) ON DELETE SET NULL,
    lead_source_id uuid REFERENCES public.lead_sources(id) ON DELETE SET NULL,
    budget_range text,
    notes text
);

-- Unique index for phone deduplication
CREATE UNIQUE INDEX IF NOT EXISTS leads_phone_e164_unique 
ON public.leads (phone_e164) 
WHERE phone_e164 IS NOT NULL;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS leads_pipeline_id_idx ON public.leads(pipeline_id);
CREATE INDEX IF NOT EXISTS leads_stage_id_idx ON public.leads(stage_id);
CREATE INDEX IF NOT EXISTS leads_status_idx ON public.leads(status);
CREATE INDEX IF NOT EXISTS leads_owner_user_id_idx ON public.leads(owner_user_id);
CREATE INDEX IF NOT EXISTS leads_assigned_to_idx ON public.leads(assigned_to);

-- ============================================================
-- 5) LEAD AUDIT LOGS (if not exists)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.lead_audit_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
    actor_id uuid,
    action text NOT NULL,
    before jsonb,
    after jsonb,
    created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lead_audit_logs_lead_id_idx ON public.lead_audit_logs(lead_id);
CREATE INDEX IF NOT EXISTS lead_audit_logs_created_at_idx ON public.lead_audit_logs(created_at DESC);

-- ============================================================
-- 6) LEAD NOTES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.lead_notes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
    user_id uuid NOT NULL,
    content text NOT NULL,
    created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lead_notes_lead_id_idx ON public.lead_notes(lead_id);

-- ============================================================
-- 7) TASKS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.tasks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
    title text NOT NULL,
    type text NOT NULL DEFAULT 'follow_up',
    status text NOT NULL DEFAULT 'open',
    due_at timestamptz,
    notes text,
    assigned_to uuid,
    created_by uuid,
    created_at timestamptz DEFAULT now(),
    completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS tasks_lead_id_idx ON public.tasks(lead_id);
CREATE INDEX IF NOT EXISTS tasks_status_idx ON public.tasks(status);
CREATE INDEX IF NOT EXISTS tasks_due_at_idx ON public.tasks(due_at);

-- ============================================================
-- 8) PROFILES TABLE (update if exists)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.profiles (
    id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name text,
    email text,
    role text NOT NULL DEFAULT 'corretor',
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Add missing columns to profiles if they don't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'full_name') THEN
        ALTER TABLE public.profiles ADD COLUMN full_name text;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'role') THEN
        ALTER TABLE public.profiles ADD COLUMN role text NOT NULL DEFAULT 'corretor';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'is_active') THEN
        ALTER TABLE public.profiles ADD COLUMN is_active boolean NOT NULL DEFAULT true;
    END IF;
END $$;

-- ============================================================
-- 9) SEED DEFAULT PIPELINE
-- ============================================================
INSERT INTO public.pipelines (id, name)
VALUES ('00000000-0000-0000-0000-000000000001', 'Pipeline Principal')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.pipeline_stages (pipeline_id, name, position)
VALUES 
    ('00000000-0000-0000-0000-000000000001', 'Novo', 0),
    ('00000000-0000-0000-0000-000000000001', 'Contato', 1),
    ('00000000-0000-0000-0000-000000000001', 'Qualificação', 2),
    ('00000000-0000-0000-0000-000000000001', 'Proposta', 3),
    ('00000000-0000-0000-0000-000000000001', 'Negociação', 4)
ON CONFLICT DO NOTHING;

-- ============================================================
-- 10) SEED CATALOGS
-- ============================================================
INSERT INTO public.lead_types (name, position) VALUES
    ('Compra', 0),
    ('Venda', 1),
    ('Aluguel', 2),
    ('Investimento', 3)
ON CONFLICT DO NOTHING;

INSERT INTO public.lead_interests (name, position) VALUES
    ('Apartamento', 0),
    ('Casa', 1),
    ('Terreno', 2),
    ('Comercial', 3),
    ('Rural', 4)
ON CONFLICT DO NOTHING;

INSERT INTO public.lead_sources (name, position) VALUES
    ('Site', 0),
    ('Indicação', 1),
    ('Instagram', 2),
    ('Facebook', 3),
    ('Google', 4),
    ('Portal Imobiliário', 5),
    ('Outro', 6)
ON CONFLICT DO NOTHING;

-- ============================================================
-- 11) RLS POLICIES
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

-- Profiles: users can read all, update own
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;
CREATE POLICY "Users can view all profiles" ON public.profiles FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Leads: role-based access
DROP POLICY IF EXISTS "Leads access policy" ON public.leads;
CREATE POLICY "Leads access policy" ON public.leads FOR ALL USING (
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

-- Pipelines/stages: everyone can read
DROP POLICY IF EXISTS "Everyone can read pipelines" ON public.pipelines;
CREATE POLICY "Everyone can read pipelines" ON public.pipelines FOR SELECT USING (true);

DROP POLICY IF EXISTS "Everyone can read stages" ON public.pipeline_stages;
CREATE POLICY "Everyone can read stages" ON public.pipeline_stages FOR SELECT USING (true);

-- Catalogs: everyone can read
DROP POLICY IF EXISTS "Everyone can read lead_types" ON public.lead_types;
CREATE POLICY "Everyone can read lead_types" ON public.lead_types FOR SELECT USING (true);

DROP POLICY IF EXISTS "Everyone can read lead_interests" ON public.lead_interests;
CREATE POLICY "Everyone can read lead_interests" ON public.lead_interests FOR SELECT USING (true);

DROP POLICY IF EXISTS "Everyone can read lead_sources" ON public.lead_sources;
CREATE POLICY "Everyone can read lead_sources" ON public.lead_sources FOR SELECT USING (true);

-- Tasks: same as leads
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
);

-- Lead notes: same as leads
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

-- ============================================================
-- DONE!
-- ============================================================
