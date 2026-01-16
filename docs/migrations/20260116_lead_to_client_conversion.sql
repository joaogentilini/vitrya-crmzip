-- Migration: Lead to Client Conversion
-- Creates people and clients tables, adds conversion columns to leads

-- 1. Create people table (unified person registry)
CREATE TABLE IF NOT EXISTS public.people (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  phone_e164 text,
  email text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Index for phone lookup
CREATE INDEX IF NOT EXISTS idx_people_phone_e164 ON public.people(phone_e164);
CREATE INDEX IF NOT EXISTS idx_people_email ON public.people(email);

-- 2. Create clients table (references people)
CREATE TABLE IF NOT EXISTS public.clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id uuid NOT NULL REFERENCES public.people(id) ON DELETE RESTRICT,
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  types text[] NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT clients_person_id_unique UNIQUE(person_id)
);

CREATE INDEX IF NOT EXISTS idx_clients_owner_id ON public.clients(owner_id);
CREATE INDEX IF NOT EXISTS idx_clients_status ON public.clients(status);

-- 3. Add conversion columns to leads table
ALTER TABLE public.leads 
  ADD COLUMN IF NOT EXISTS person_id uuid REFERENCES public.people(id),
  ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES public.clients(id),
  ADD COLUMN IF NOT EXISTS is_converted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS converted_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_leads_person_id ON public.leads(person_id);
CREATE INDEX IF NOT EXISTS idx_leads_client_id ON public.leads(client_id);
CREATE INDEX IF NOT EXISTS idx_leads_is_converted ON public.leads(is_converted);

-- 4. RLS Policies for people
ALTER TABLE public.people ENABLE ROW LEVEL SECURITY;

CREATE POLICY "people_select_all" ON public.people
  FOR SELECT USING (true);

CREATE POLICY "people_insert_authenticated" ON public.people
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "people_update_authenticated" ON public.people
  FOR UPDATE USING (auth.uid() IS NOT NULL);

-- 5. RLS Policies for clients
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clients_select_own_or_admin" ON public.clients
  FOR SELECT USING (
    owner_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() AND role IN ('admin', 'gestor')
    )
  );

CREATE POLICY "clients_insert_authenticated" ON public.clients
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "clients_update_own_or_admin" ON public.clients
  FOR UPDATE USING (
    owner_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() AND role IN ('admin', 'gestor')
    )
  );

-- 6. Updated_at trigger for people
CREATE OR REPLACE FUNCTION public.update_people_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS people_updated_at ON public.people;
CREATE TRIGGER people_updated_at
  BEFORE UPDATE ON public.people
  FOR EACH ROW EXECUTE FUNCTION public.update_people_updated_at();

-- 7. Updated_at trigger for clients
CREATE OR REPLACE FUNCTION public.update_clients_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS clients_updated_at ON public.clients;
CREATE TRIGGER clients_updated_at
  BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.update_clients_updated_at();
