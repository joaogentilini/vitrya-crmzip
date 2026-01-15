-- ============================================================
-- LEAD NOTES MODULE
-- Table + RLS policies for lead notes
-- ============================================================

-- 1) Create lead_notes table
CREATE TABLE IF NOT EXISTS public.lead_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  author_id uuid NOT NULL,
  content text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- 2) Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_lead_notes_lead_id ON public.lead_notes(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_notes_author_id ON public.lead_notes(author_id);
CREATE INDEX IF NOT EXISTS idx_lead_notes_created_at ON public.lead_notes(created_at DESC);

-- 3) Enable RLS
ALTER TABLE public.lead_notes ENABLE ROW LEVEL SECURITY;

-- 4) Drop existing policies if any (idempotent)
DROP POLICY IF EXISTS "lead_notes_select" ON public.lead_notes;
DROP POLICY IF EXISTS "lead_notes_insert" ON public.lead_notes;
DROP POLICY IF EXISTS "lead_notes_update" ON public.lead_notes;
DROP POLICY IF EXISTS "lead_notes_delete" ON public.lead_notes;

-- 5) Create RLS policies
-- Users can view notes on leads they own or are assigned to, or if they are admin/gestor
CREATE POLICY "lead_notes_select" ON public.lead_notes
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = lead_notes.lead_id
      AND (
        l.owner_user_id = auth.uid()
        OR l.created_by = auth.uid()
        OR l.assigned_to = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid()
          AND p.role IN ('admin', 'gestor')
        )
      )
    )
  );

-- Users can insert notes on leads they have access to
CREATE POLICY "lead_notes_insert" ON public.lead_notes
  FOR INSERT
  WITH CHECK (
    author_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = lead_notes.lead_id
      AND (
        l.owner_user_id = auth.uid()
        OR l.created_by = auth.uid()
        OR l.assigned_to = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid()
          AND p.role IN ('admin', 'gestor')
        )
      )
    )
  );

-- Only author can update their own notes
CREATE POLICY "lead_notes_update" ON public.lead_notes
  FOR UPDATE
  USING (author_id = auth.uid())
  WITH CHECK (author_id = auth.uid());

-- Author can delete their own notes, or admin/gestor can delete any
CREATE POLICY "lead_notes_delete" ON public.lead_notes
  FOR DELETE
  USING (
    author_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('admin', 'gestor')
    )
  );

-- ============================================================
-- VERIFICATION
-- ============================================================
-- SELECT tablename, policyname FROM pg_policies WHERE tablename = 'lead_notes';
