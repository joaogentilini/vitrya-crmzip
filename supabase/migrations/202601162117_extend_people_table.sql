-- ============================================================
-- MIGRATION: Extend people table for Sprint 1
-- Date: 2026-01-16
-- Purpose: Add document_id, kind_tags, owner_profile_id, 
--          created_by_profile_id and update RLS for role-based access
-- ============================================================

-- ============================================================
-- PART A: ADD NEW COLUMNS
-- ============================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'people' AND column_name = 'document_id'
    ) THEN
        ALTER TABLE public.people ADD COLUMN document_id text;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'people' AND column_name = 'kind_tags'
    ) THEN
        ALTER TABLE public.people ADD COLUMN kind_tags text[];
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'people' AND column_name = 'owner_profile_id'
    ) THEN
        ALTER TABLE public.people ADD COLUMN owner_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'people' AND column_name = 'created_by_profile_id'
    ) THEN
        ALTER TABLE public.people ADD COLUMN created_by_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
    END IF;
END $$;

-- ============================================================
-- PART B: ADD INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_people_owner_profile_id ON public.people(owner_profile_id);
CREATE INDEX IF NOT EXISTS idx_people_created_by_profile_id ON public.people(created_by_profile_id);
CREATE INDEX IF NOT EXISTS idx_people_document_id ON public.people(document_id);

-- ============================================================
-- PART C: UPDATE TRIGGER FOR NEW COLUMNS
-- ============================================================

DROP TRIGGER IF EXISTS set_updated_at_people ON public.people;
CREATE TRIGGER set_updated_at_people
  BEFORE UPDATE ON public.people
  FOR EACH ROW
  WHEN (
    OLD.full_name IS DISTINCT FROM NEW.full_name OR
    OLD.phone_e164 IS DISTINCT FROM NEW.phone_e164 OR
    OLD.email IS DISTINCT FROM NEW.email OR
    OLD.notes IS DISTINCT FROM NEW.notes OR
    OLD.document_id IS DISTINCT FROM NEW.document_id OR
    OLD.kind_tags IS DISTINCT FROM NEW.kind_tags OR
    OLD.owner_profile_id IS DISTINCT FROM NEW.owner_profile_id
  )
  EXECUTE FUNCTION public.trigger_set_updated_at();

-- ============================================================
-- PART D: UPDATE RLS POLICIES FOR ROLE-BASED ACCESS
-- ============================================================

-- Drop existing policies
DROP POLICY IF EXISTS "people_select_all" ON public.people;
DROP POLICY IF EXISTS "people_insert_authenticated" ON public.people;
DROP POLICY IF EXISTS "people_update_authenticated" ON public.people;
DROP POLICY IF EXISTS "people_delete_admin" ON public.people;

-- SELECT: admin/gestor see all, corretor sees only own (owner or created_by)
CREATE POLICY "people_select" ON public.people FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
        AND (
            p.role IN ('admin', 'gestor')
            OR people.owner_profile_id = auth.uid()
            OR people.created_by_profile_id = auth.uid()
        )
    )
);

-- INSERT: all authenticated users, created_by must be current user
CREATE POLICY "people_insert" ON public.people FOR INSERT 
  WITH CHECK (
    auth.uid() IS NOT NULL 
    AND created_by_profile_id = auth.uid()
  );

-- UPDATE: admin/gestor can update all, corretor only own
CREATE POLICY "people_update" ON public.people FOR UPDATE USING (
    EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
        AND (
            p.role IN ('admin', 'gestor')
            OR people.owner_profile_id = auth.uid()
            OR people.created_by_profile_id = auth.uid()
        )
    )
) WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
        AND (
            p.role IN ('admin', 'gestor')
            OR people.owner_profile_id = auth.uid()
            OR people.created_by_profile_id = auth.uid()
        )
    )
);

-- DELETE: only admin/gestor (corretor cannot delete)
CREATE POLICY "people_delete" ON public.people FOR DELETE USING (
    EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'gestor')
    )
);

-- ============================================================
-- DONE
-- ============================================================
-- To apply: Run this in Supabase SQL Editor
-- After applying, update docs/db/SCHEMA_BASELINE.md
-- ============================================================
