-- ============================================================
-- MIGRATION: Properties and Property Documents
-- Date: 2026-01-18
-- Purpose: Create properties table (with status for publishing)
--          and property_documents table for document management
-- ============================================================

-- ============================================================
-- PART 1: PROPERTIES TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS public.properties (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    title text NOT NULL,
    description text,
    address text,
    city text,
    state text,
    zip_code text,
    property_type text CHECK (property_type IN ('house', 'apartment', 'land', 'commercial', 'rural', 'other')),
    status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'inactive', 'sold', 'rented')),
    owner_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_properties_owner_user_id ON public.properties(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_properties_status ON public.properties(status);

-- RLS for properties
ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "properties_select" ON public.properties;
CREATE POLICY "properties_select" ON public.properties FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.profiles p 
        WHERE p.id = auth.uid() 
        AND p.is_active = true
        AND (p.role IN ('admin', 'gestor') OR properties.owner_user_id = auth.uid())
    )
);

DROP POLICY IF EXISTS "properties_insert" ON public.properties;
CREATE POLICY "properties_insert" ON public.properties FOR INSERT WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.profiles p 
        WHERE p.id = auth.uid() 
        AND p.is_active = true
        AND (
            p.role IN ('admin', 'gestor')
            OR owner_user_id = auth.uid()
        )
    )
);

DROP POLICY IF EXISTS "properties_update" ON public.properties;
CREATE POLICY "properties_update" ON public.properties FOR UPDATE USING (
    EXISTS (
        SELECT 1 FROM public.profiles p 
        WHERE p.id = auth.uid() 
        AND p.is_active = true
        AND (p.role IN ('admin', 'gestor') OR properties.owner_user_id = auth.uid())
    )
);

DROP POLICY IF EXISTS "properties_delete" ON public.properties;
CREATE POLICY "properties_delete" ON public.properties FOR DELETE USING (
    EXISTS (
        SELECT 1 FROM public.profiles p 
        WHERE p.id = auth.uid() 
        AND p.is_active = true
        AND (p.role IN ('admin', 'gestor') OR properties.owner_user_id = auth.uid())
    )
);

-- ============================================================
-- PART 2: PROPERTY DOCUMENTS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS public.property_documents (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
    doc_type text NOT NULL CHECK (doc_type IN ('authorization', 'other')),
    title text,
    path text NOT NULL,
    mime_type text,
    size_bytes bigint,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_property_documents_property_id ON public.property_documents(property_id);
CREATE INDEX IF NOT EXISTS idx_property_documents_property_id_doc_type ON public.property_documents(property_id, doc_type);

-- RLS for property_documents
ALTER TABLE public.property_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "property_documents_select" ON public.property_documents;
CREATE POLICY "property_documents_select" ON public.property_documents FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.properties prop
        JOIN public.profiles p ON p.id = auth.uid()
        WHERE prop.id = property_documents.property_id
        AND p.is_active = true
        AND (p.role IN ('admin', 'gestor') OR prop.owner_user_id = auth.uid())
    )
);

DROP POLICY IF EXISTS "property_documents_insert" ON public.property_documents;
CREATE POLICY "property_documents_insert" ON public.property_documents FOR INSERT WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.properties prop
        JOIN public.profiles p ON p.id = auth.uid()
        WHERE prop.id = property_documents.property_id
        AND p.is_active = true
        AND (p.role IN ('admin', 'gestor') OR prop.owner_user_id = auth.uid())
    )
);

DROP POLICY IF EXISTS "property_documents_update" ON public.property_documents;
CREATE POLICY "property_documents_update" ON public.property_documents FOR UPDATE USING (
    EXISTS (
        SELECT 1 FROM public.properties prop
        JOIN public.profiles p ON p.id = auth.uid()
        WHERE prop.id = property_documents.property_id
        AND p.is_active = true
        AND (p.role IN ('admin', 'gestor') OR prop.owner_user_id = auth.uid())
    )
);

DROP POLICY IF EXISTS "property_documents_delete" ON public.property_documents;
CREATE POLICY "property_documents_delete" ON public.property_documents FOR DELETE USING (
    EXISTS (
        SELECT 1 FROM public.properties prop
        JOIN public.profiles p ON p.id = auth.uid()
        WHERE prop.id = property_documents.property_id
        AND p.is_active = true
        AND (p.role IN ('admin', 'gestor') OR prop.owner_user_id = auth.uid())
    )
);

-- ============================================================
-- PART 3: STORAGE POLICIES FOR property-documents BUCKET
-- ============================================================
-- Note: Run these in Supabase Dashboard SQL Editor after creating
-- the bucket 'property-documents' (Private) in Storage settings

-- Storage policies (to be applied after bucket creation):
/*
-- SELECT policy
CREATE POLICY "property_documents_storage_select"
ON storage.objects FOR SELECT
USING (
    bucket_id = 'property-documents'
    AND EXISTS (
        SELECT 1 FROM public.properties prop
        JOIN public.profiles p ON p.id = auth.uid()
        WHERE prop.id::text = (storage.foldername(name))[2]
        AND p.is_active = true
        AND (p.role IN ('admin', 'gestor') OR prop.owner_user_id = auth.uid())
    )
);

-- INSERT policy
CREATE POLICY "property_documents_storage_insert"
ON storage.objects FOR INSERT
WITH CHECK (
    bucket_id = 'property-documents'
    AND EXISTS (
        SELECT 1 FROM public.properties prop
        JOIN public.profiles p ON p.id = auth.uid()
        WHERE prop.id::text = (storage.foldername(name))[2]
        AND p.is_active = true
        AND (p.role IN ('admin', 'gestor') OR prop.owner_user_id = auth.uid())
    )
);

-- UPDATE policy
CREATE POLICY "property_documents_storage_update"
ON storage.objects FOR UPDATE
USING (
    bucket_id = 'property-documents'
    AND EXISTS (
        SELECT 1 FROM public.properties prop
        JOIN public.profiles p ON p.id = auth.uid()
        WHERE prop.id::text = (storage.foldername(name))[2]
        AND p.is_active = true
        AND (p.role IN ('admin', 'gestor') OR prop.owner_user_id = auth.uid())
    )
);

-- DELETE policy
CREATE POLICY "property_documents_storage_delete"
ON storage.objects FOR DELETE
USING (
    bucket_id = 'property-documents'
    AND EXISTS (
        SELECT 1 FROM public.properties prop
        JOIN public.profiles p ON p.id = auth.uid()
        WHERE prop.id::text = (storage.foldername(name))[2]
        AND p.is_active = true
        AND (p.role IN ('admin', 'gestor') OR prop.owner_user_id = auth.uid())
    )
);
*/
